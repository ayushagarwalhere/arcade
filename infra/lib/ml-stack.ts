import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as sagemaker from "aws-cdk-lib/aws-sagemaker";
import type { Construct } from "constructs";

export interface ArcadeMlStackProps extends StackProps {
  stage: string;
  /** Local path to the model.tar.gz built by ml/package_model.py. */
  modelArtifact: string;
  /** Changes whenever the model does, so CloudFormation replaces the model and rolls the endpoint. */
  modelVersion: string;
}

/** AWS's public Hugging Face inference containers live in this account in every commercial region. */
const DLC_ACCOUNT = "763104351884";
const DLC_IMAGE = "huggingface-pytorch-inference:2.1.0-transformers4.37.0-cpu-py310-ubuntu22.04";

/**
 * The false-positive classifier, hosted on SageMaker Serverless Inference.
 *
 * Deliberately its own stack, in its own CDK app (bin/ml.ts): deploying it cannot
 * touch the API, the table, Cognito or the website. Serverless inference scales to
 * zero, so an idle endpoint costs nothing; the first request after idling pays a cold start.
 */
export class ArcadeMlStack extends Stack {
  constructor(scope: Construct, id: string, props: ArcadeMlStackProps) {
    super(scope, id, props);

    const artifact = new Asset(this, "ModelArtifact", { path: props.modelArtifact });

    const role = new iam.Role(this, "ModelRole", { assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com") });
    artifact.grantRead(role);
    role.addToPolicy(new iam.PolicyStatement({ actions: ["ecr:GetAuthorizationToken"], resources: ["*"] }));
    role.addToPolicy(new iam.PolicyStatement({ actions: ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"], resources: [`arn:aws:ecr:${this.region}:${DLC_ACCOUNT}:repository/huggingface-pytorch-inference`] }));
    role.addToPolicy(new iam.PolicyStatement({ actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"], resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/sagemaker/*`] }));
    role.addToPolicy(new iam.PolicyStatement({ actions: ["cloudwatch:PutMetricData"], resources: ["*"] }));

    const model = new sagemaker.CfnModel(this, `Model${props.modelVersion}`, {
      executionRoleArn: role.roleArn,
      primaryContainer: {
        image: `${DLC_ACCOUNT}.dkr.ecr.${this.region}.amazonaws.com/${DLC_IMAGE}`,
        modelDataUrl: artifact.s3ObjectUrl,
        environment: { SAGEMAKER_PROGRAM: "inference.py", MODEL_VERSION: props.modelVersion },
      },
    });
    // The role's policy must exist before SageMaker validates that it can read the artifact.
    model.node.addDependency(role);

    const config = new sagemaker.CfnEndpointConfig(this, `Config${props.modelVersion}`, {
      productionVariants: [{ variantName: "AllTraffic", modelName: model.attrModelName, serverlessConfig: { memorySizeInMb: 3072, maxConcurrency: 2 } }],
    });

    const endpoint = new sagemaker.CfnEndpoint(this, "Endpoint", {
      endpointName: `arcade-fp-classifier-${props.stage}`,
      endpointConfigName: config.attrEndpointConfigName,
    });

    new CfnOutput(this, "EndpointName", { value: endpoint.attrEndpointName });
    new CfnOutput(this, "EndpointArn", { value: endpoint.ref });
    new CfnOutput(this, "ModelVersion", { value: props.modelVersion });
  }
}
