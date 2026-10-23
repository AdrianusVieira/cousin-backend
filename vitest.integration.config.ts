import { defineConfig } from "vitest/config";

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "Set TEST_DATABASE_URL to an isolated PostgreSQL test database; production DATABASE_URL is never used.",
  );

export default defineConfig({
  test: {
    include: ["integration/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    env: {
      DATABASE_URL: "postgres://unused:unused@localhost/unused",
      SUPABASE_JWKS_URL: "https://example.invalid/auth/v1/.well-known/jwks.json",
      SUPABASE_JWT_SECRET: "test-secret",
      ALLOWED_USER_IDS: "11111111-1111-4111-8111-111111111111",
    },
  },
});
