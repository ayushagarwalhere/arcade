/**
 * The model client: one question, one schema-validated answer.
 *
 * `bedrockModel` talks to Claude in Amazon Bedrock with the role's own AWS
 * credentials — no key is configured anywhere. Routes depend on the
 * `ModelClient` interface, so tests substitute a fake and never reach AWS.
 *
 * Bedrock's Messages endpoint does not offer structured outputs, so the answer
 * comes back through a tool call instead: the model is given one tool whose
 * input schema is the answer's shape, and the input is validated here with the
 * same zod schema. An answer that fails validation is sent back once with the
 * validation errors before the request is given up on.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { z } from "zod";
import { HttpError } from "../errors";

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface ModelResult<T> {
  value: T;
  usage: ModelUsage;
  model: string;
}

export interface ModelClient {
  structured<S extends z.ZodType>(args: { system: string; user: string; schema: S; effort?: "low" | "medium" | "high" }): Promise<ModelResult<z.infer<S>>>;
}

const ANSWER_TOOL = "submit_answer";
const MAX_ATTEMPTS = 2;

export function bedrockModel(opts: { region: string; modelId: string; clientOptions?: ConstructorParameters<typeof AnthropicBedrockMantle>[0] }): ModelClient {
  // One SDK retry per attempt, so the worst case (2 attempts × 2 tries × 55 s) stays inside the function's 5-minute timeout.
  const client = new AnthropicBedrockMantle({ awsRegion: opts.region, maxRetries: 1, timeout: 55_000, ...opts.clientOptions });

  async function send(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    try {
      return await client.messages.create(params);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "model_rate_limited", "The model is busy — try again shortly");
      if (e instanceof Anthropic.APIConnectionError) throw new HttpError(502, "model_unreachable", "Could not reach the model");
      if (e instanceof Anthropic.APIError) {
        console.error("bedrock request failed", { status: e.status, message: e.message });
        throw new HttpError(502, "model_error", "The model request failed");
      }
      throw e;
    }
  }

  return {
    async structured({ system, user, schema, effort = "medium" }) {
      const tool: Anthropic.Tool = {
        name: ANSWER_TOOL,
        description: "Submit your final answer. Call this exactly once, when your analysis is complete.",
        input_schema: z.toJSONSchema(schema) as Anthropic.Tool.InputSchema,
      };
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${user}\n\nWhen your analysis is complete, call the ${ANSWER_TOOL} tool with your answer. Do not answer in prose.` }];
      const usage: ModelUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
      let model = opts.modelId;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const response = await send({
          model: opts.modelId,
          max_tokens: 16_000,
          thinking: { type: "adaptive" },
          output_config: { effort },
          system,
          tools: [tool],
          messages,
        });
        usage.inputTokens += response.usage.input_tokens;
        usage.outputTokens += response.usage.output_tokens;
        usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
        model = response.model;

        // A refusal or a truncated answer is a 200 from the model; neither is a usable result.
        if (response.stop_reason === "refusal") throw new ModelDeclined(usage, model, "model_refused");
        if (response.stop_reason === "max_tokens") throw new ModelDeclined(usage, model, "model_truncated");

        const call = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === ANSWER_TOOL);
        const parsed = call ? schema.safeParse(call.input) : null;
        if (parsed?.success) return { value: parsed.data, usage, model };

        // Echo the turn back unchanged (thinking blocks included) and say what was wrong.
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: call
            ? [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `The answer did not match the schema:\n${z.prettifyError(parsed!.error)}\nCall ${ANSWER_TOOL} again with a corrected answer.` }]
            : `You did not call ${ANSWER_TOOL}. Call it now with your answer.`,
        });
      }
      throw new ModelDeclined(usage, model, "model_invalid_answer");
    },
  };
}

const DECLINED = {
  model_refused: [422, "The model declined this request"],
  model_truncated: [502, "The model's answer was cut off"],
  model_invalid_answer: [502, "The model did not return a usable answer"],
} as const;

/** The model answered but gave nothing usable. Tokens were still spent, so usage rides along. */
export class ModelDeclined extends HttpError {
  constructor(
    public usage: ModelUsage,
    public model: string,
    code: keyof typeof DECLINED = "model_refused",
  ) {
    super(DECLINED[code][0], code, DECLINED[code][1]);
  }
}
