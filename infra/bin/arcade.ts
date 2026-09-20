/**
 * One stack per stage:  npx cdk deploy -c stage=prod
 *
 * Context (cdk.json or -c key=value): stage, bedrockModelId, monthlyTokenBudget,
 * corsOrigins, authCallbackUrls. The account and region come from the AWS
 * credentials in use, so the same code deploys anywhere.
 */
import "dotenv/config";
import { App } from "aws-cdk-lib";
import { ArcadeStack } from "../lib/arcade-stack";

const app = new App();
const stage = String(app.node.tryGetContext("stage") ?? "dev");
const csv = (key: string) => String(app.node.tryGetContext(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

new ArcadeStack(app, `Arcade-${stage}`, {
  stage,
  bedrockModelId: String(app.node.tryGetContext("bedrockModelId")),
  monthlyTokenBudget: Number(app.node.tryGetContext("monthlyTokenBudget")),
  corsOrigins: csv("corsOrigins"),
  authCallbackUrls: csv("authCallbackUrls"),
  fpEndpointName: app.node.tryGetContext("fpEndpointName") ? String(app.node.tryGetContext("fpEndpointName")) : undefined,
  description: `Arcade backend (${stage})`,
});
