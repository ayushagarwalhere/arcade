/** AWS Lambda entry point (Function URL / API Gateway payload v2). */
import { handle } from "hono/aws-lambda";
import { createAppFromConfig } from "./app";
import { loadConfig } from "./env";

// Built once per execution environment, so clients and the JWKS cache survive across invocations.
export const handler = handle(createAppFromConfig(loadConfig()));
