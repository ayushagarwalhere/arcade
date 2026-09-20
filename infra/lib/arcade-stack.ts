import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import type { Construct } from "constructs";

export interface ArcadeStackProps extends StackProps {
  stage: string;
  bedrockModelId: string;
  monthlyTokenBudget: number;
  corsOrigins: string[];
  authCallbackUrls: string[];
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export class ArcadeStack extends Stack {
  constructor(scope: Construct, id: string, props: ArcadeStackProps) {
    super(scope, id, props);
    const prod = props.stage === "prod";

    /* ---------------------------------------------------------------- data */

    // Key layout is documented in apps/api/src/db/keys.ts; the attribute names here must match it.
    const table = new dynamodb.TableV2(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [{ indexName: "GSI1", partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING }, sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING } }],
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: "ttl",
      // The audit trail lives here: keep it recoverable, and never let a stack delete take prod data with it.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    /* ---------------------------------------------------------------- auth */

    const userPool = new cognito.UserPool(this, "Users", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: false },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // A public client: desktop, web and mobile apps cannot keep a secret, so they use PKCE instead.
    const appClient = userPool.addClient("Apps", {
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE], callbackUrls: props.authCallbackUrls, logoutUrls: props.authCallbackUrls },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    const domain = userPool.addDomain("HostedUi", { cognitoDomain: { domainPrefix: `arcade-${props.stage}-${this.account}` } });

    /* ----------------------------------------------------------------- api */

    const api = new NodejsFunction(this, "Api", {
      entry: `${repoRoot}apps/api/src/lambda.ts`,
      projectRoot: repoRoot,
      depsLockFilePath: `${repoRoot}package-lock.json`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      // A model request can be two attempts of up to ~2 minutes each; see apps/api/src/model/client.ts.
      timeout: Duration.minutes(5),
      logGroup: new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.THREE_MONTHS, removalPolicy: prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY }),
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        minify: true,
        sourceMap: true,
        // Bundle the AWS SDK too, so the deployed code runs the versions it was tested with.
        externalModules: [],
        banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        ARCADE_STAGE: props.stage,
        TABLE_NAME: table.tableName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_IDS: appClient.userPoolClientId,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        MODEL_MONTHLY_TOKEN_BUDGET: String(props.monthlyTokenBudget),
        CORS_ORIGINS: props.corsOrigins.join(","),
      },
    });

    table.grantReadWriteData(api);

    // Claude in Amazon Bedrock (the bedrock-mantle Messages endpoint) authorizes with this action.
    // The resource is open because the model ARN format for this service is not confirmed yet —
    // narrow it to the chosen model's ARN (see the Bedrock Mantle IAM docs) before a prod deploy.
    api.addToRolePolicy(new iam.PolicyStatement({ actions: ["bedrock-mantle:CreateInference"], resources: ["*"] }));

    // A Function URL rather than API Gateway: model requests outlast API Gateway's 30-second limit.
    // The app authenticates every /v1 request itself (Cognito JWT or API token), so the URL is public.
    const url = api.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    new CfnOutput(this, "ApiUrl", { value: url.url });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: appClient.userPoolClientId });
    new CfnOutput(this, "HostedUiDomain", { value: domain.baseUrl() });
  }
}
