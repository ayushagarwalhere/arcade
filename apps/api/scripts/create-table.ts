/**
 * Creates the table in DynamoDB Local. Production tables come from infra/ —
 * this mirrors that definition (see src/db/keys.ts) for local work and tests.
 *
 *   docker run -d -p 8000:8000 amazon/dynamodb-local
 *   DYNAMO_ENDPOINT=http://localhost:8000 npm run db:create-local -w apps/api
 */
import { CreateTableCommand, DynamoDBClient, ResourceInUseException } from "@aws-sdk/client-dynamodb";
import { LOCAL_CREDENTIALS } from "../src/db/dynamo";
import { TABLE } from "../src/db/keys";
import { loadConfig } from "../src/env";

/** `region` must match the one the app runs with: DynamoDB Local keeps a separate set of tables per region. */
export async function createLocalTable(endpoint: string, tableName: string, region: string) {
  const client = new DynamoDBClient({ endpoint, region, credentials: LOCAL_CREDENTIALS });
  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [TABLE.pk, TABLE.sk, TABLE.gsi1pk, TABLE.gsi1sk].map((AttributeName) => ({ AttributeName, AttributeType: "S" as const })),
        KeySchema: [
          { AttributeName: TABLE.pk, KeyType: "HASH" },
          { AttributeName: TABLE.sk, KeyType: "RANGE" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: TABLE.gsi1,
            KeySchema: [
              { AttributeName: TABLE.gsi1pk, KeyType: "HASH" },
              { AttributeName: TABLE.gsi1sk, KeyType: "RANGE" },
            ],
            Projection: { ProjectionType: "ALL" },
          },
        ],
      }),
    );
  } catch (e) {
    if (!(e instanceof ResourceInUseException)) throw e;
  }
}

if (process.argv[1]?.endsWith("create-table.ts")) {
  const endpoint = process.env.DYNAMO_ENDPOINT;
  if (!endpoint) throw new Error("Set DYNAMO_ENDPOINT — this script only ever targets DynamoDB Local");
  const tableName = process.env.TABLE_NAME ?? "arcade";
  await createLocalTable(endpoint, tableName, loadConfig({ ARCADE_AUTH: "dev", ...process.env }).region);
  console.log(`Table "${tableName}" is ready at ${endpoint}`);
}
