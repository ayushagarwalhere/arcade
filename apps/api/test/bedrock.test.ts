/** The real Bedrock client, with only the network replaced: canned Messages API responses come back from `fetch`. */
import { describe, expect, it } from "vitest";
import { bedrockModel, ModelDeclined } from "../src/model/client";
import { proposeResponse } from "../src/model/schemas";

type Body = { model: string; system: string; tools: { name: string; input_schema: { type: string; required?: string[] } }[]; messages: { role: string; content: unknown }[]; thinking: unknown; output_config: unknown };

function connect(replies: object[]) {
  const requests: { url: string; body: Body }[] = [];
  const model = bedrockModel({
    region: "us-east-1",
    modelId: "anthropic.claude-opus-5",
    clientOptions: {
      skipAuth: true,
      maxRetries: 0,
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) });
        const reply = replies.shift();
        if (!reply) throw new Error("no canned reply left");
        return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  });
  return { model, requests };
}

const message = (content: object[], stop_reason = "tool_use") => ({ id: "msg_1", type: "message", role: "assistant", model: "anthropic.claude-opus-5", content, stop_reason, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } });
const answer = (input: object, id = "toolu_1") => ({ type: "tool_use", id, name: "submit_answer", input });
const ask = { system: "sys", user: "fix it", schema: proposeResponse };
const good = { mode: "replace", code: ["x"], rationale: "r" };

describe("bedrockModel", () => {
  it("asks Bedrock for a tool call shaped like the schema, and returns the validated input", async () => {
    const { model, requests } = connect([message([{ type: "text", text: "Done." }, answer(good)])]);
    const out = await model.structured(ask);
    expect(out.value).toEqual(good);
    expect(out.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 });

    const { url, body } = requests[0];
    expect(url).toBe("https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages");
    expect(body.model).toBe("anthropic.claude-opus-5");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config).toEqual({ effort: "medium" });
    expect(body.tools[0].input_schema).toMatchObject({ type: "object", required: ["mode", "code", "rationale"] });
    // Structured outputs are not available on this endpoint, so the request must not ask for them.
    expect(JSON.stringify(body)).not.toContain('"format"');
  });

  it("sends an invalid answer back once with the validation error, then accepts the correction", async () => {
    const { model, requests } = connect([message([answer({ mode: "rewrite-everything", code: "x" }, "toolu_bad")]), message([answer(good, "toolu_ok")])]);
    const out = await model.structured(ask);
    expect(out.value).toEqual(good);
    expect(out.usage.inputTokens).toBe(200);

    const retry = requests[1].body.messages;
    expect(retry).toHaveLength(3);
    expect(retry[1]).toMatchObject({ role: "assistant", content: [{ type: "tool_use", id: "toolu_bad" }] });
    expect(retry[2]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_bad", is_error: true }] });
  });

  it("gives up after a second unusable answer, keeping count of what was spent", async () => {
    const { model } = connect([message([{ type: "text", text: "Here you go" }], "end_turn"), message([answer({ nope: true })])]);
    const err = await model.structured(ask).catch((e) => e);
    expect(err).toBeInstanceOf(ModelDeclined);
    expect(err).toMatchObject({ code: "model_invalid_answer", status: 502, usage: { inputTokens: 200, outputTokens: 40 } });
  });

  it("reports a refusal as a refusal", async () => {
    const { model } = connect([message([], "refusal")]);
    await expect(model.structured(ask)).rejects.toMatchObject({ code: "model_refused", status: 422 });
  });

  it("maps a throttled request to 429", async () => {
    const model = bedrockModel({
      region: "us-east-1",
      modelId: "anthropic.claude-opus-5",
      clientOptions: { skipAuth: true, maxRetries: 0, fetch: async () => new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "slow down" } }), { status: 429, headers: { "content-type": "application/json" } }) },
    });
    await expect(model.structured(ask)).rejects.toMatchObject({ code: "model_rate_limited", status: 429 });
  });
});
