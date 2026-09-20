import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src`, import.meta.url));

export default defineConfig({
  resolve: {
    // Workspace packages ship TypeScript source; resolve them the way the apps' tsconfig paths do.
    alias: [
      { find: /^@arcade\/core\/(.*)$/, replacement: `${pkg("core")}/$1` },
      { find: /^@arcade\/agents\/(.*)$/, replacement: `${pkg("agents")}/$1` },
    ],
  },
  test: { include: ["test/**/*.test.ts"] },
});
