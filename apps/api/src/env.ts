/**
 * Configuration, read once from the environment.
 *
 * Nothing here is a secret: AWS credentials come from the Lambda role (or the
 * default credential chain locally), never from these variables.
 */
export interface Config {
  stage: string;
  region: string;
  auth:
    | { mode: "cognito"; userPoolId: string; clientIds: string[] }
    /** Local development only: `Authorization: Bearer dev:<userId>`. */
    | { mode: "dev" };
  store: { kind: "dynamo"; tableName: string; endpoint?: string } | { kind: "memory" };
  model: {
    enabled: boolean;
    /** Bedrock model id — note the `anthropic.` prefix. */
    modelId: string;
    region: string;
    /** Input + output tokens one org may spend per calendar month. */
    monthlyTokenBudget: number;
    /** Largest source payload a single model request may carry. */
    maxSourceBytes: number;
  };
  corsOrigins: string[];
}

const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
const int = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1";
  const inLambda = !!env.AWS_LAMBDA_FUNCTION_NAME;

  let auth: Config["auth"];
  if (env.ARCADE_AUTH === "dev") {
    // Dev auth trusts whatever user id the caller names, so it must never be
    // reachable from a deployed function.
    if (inLambda || env.NODE_ENV === "production") throw new Error("ARCADE_AUTH=dev is not allowed in a deployed environment");
    auth = { mode: "dev" };
  } else {
    const userPoolId = env.COGNITO_USER_POOL_ID;
    const clientIds = list(env.COGNITO_CLIENT_IDS);
    if (!userPoolId || !clientIds.length) throw new Error("COGNITO_USER_POOL_ID and COGNITO_CLIENT_IDS are required (or set ARCADE_AUTH=dev locally)");
    auth = { mode: "cognito", userPoolId, clientIds };
  }

  const store: Config["store"] =
    env.ARCADE_STORE === "memory"
      ? { kind: "memory" }
      : { kind: "dynamo", tableName: env.TABLE_NAME ?? "arcade", endpoint: env.DYNAMO_ENDPOINT || undefined };

  return {
    stage: env.ARCADE_STAGE ?? "dev",
    region,
    auth,
    store,
    model: {
      enabled: env.ARCADE_MODEL !== "off",
      modelId: env.BEDROCK_MODEL_ID ?? "anthropic.claude-opus-5",
      region: env.BEDROCK_REGION ?? region,
      monthlyTokenBudget: int(env.MODEL_MONTHLY_TOKEN_BUDGET, 5_000_000),
      maxSourceBytes: int(env.MODEL_MAX_SOURCE_BYTES, 200_000),
    },
    corsOrigins: list(env.CORS_ORIGINS),
  };
}
