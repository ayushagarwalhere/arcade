import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load root .env and infra/.env if present
if (existsSync(path.join(root, ".env"))) {
  dotenv.config({ path: path.join(root, ".env") });
}
if (existsSync(path.join(__dirname, ".env"))) {
  dotenv.config({ path: path.join(__dirname, ".env"), override: true });
}

// Fall back / sync region
if (process.env.AWS_REGION && !process.env.AWS_DEFAULT_REGION) {
  process.env.AWS_DEFAULT_REGION = process.env.AWS_REGION;
}
if (process.env.AWS_DEFAULT_REGION && !process.env.AWS_REGION) {
  process.env.AWS_REGION = process.env.AWS_DEFAULT_REGION;
}

const cdkBin = path.join(root, "node_modules", "aws-cdk", "bin", "cdk");
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [cdkBin, ...args], {
  cwd: __dirname,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 0);
