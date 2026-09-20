/**
 * The ML stack's own CDK app — it never loads the main Arcade stack, so it cannot change it.
 *
 *   python ml/package_model.py …                      (builds model.tar.gz)
 *   npx cdk --app "npx tsx bin/ml.ts" deploy -c stage=prod -c modelArtifact=<path to model.tar.gz> -c modelVersion=r2
 */
import { App } from "aws-cdk-lib";
import { ArcadeMlStack } from "../lib/ml-stack";

const app = new App();
const stage = String(app.node.tryGetContext("stage") ?? "dev");
const modelArtifact = app.node.tryGetContext("modelArtifact");
if (!modelArtifact) throw new Error("Pass -c modelArtifact=<path to model.tar.gz> (build it with ml/package_model.py)");

new ArcadeMlStack(app, `ArcadeMl-${stage}`, {
  stage,
  modelArtifact: String(modelArtifact),
  modelVersion: String(app.node.tryGetContext("modelVersion") ?? "r1").replace(/[^A-Za-z0-9]/g, ""),
  description: `Arcade false-positive classifier on SageMaker Serverless Inference (${stage})`,
});
