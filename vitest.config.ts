import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      SUPABASE_JWT_SECRET: "test-secret",
      SUPABASE_JWKS_URL: "https://example.invalid/auth/v1/.well-known/jwks.json",
      ALLOWED_USER_IDS: "11111111-1111-4111-8111-111111111111",
    },
  },
});
