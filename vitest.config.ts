import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      SUPABASE_JWKS_URL: "https://test.supabase.co/auth/v1/.well-known/jwks.json",
      ALLOWED_USER_IDS: "00000000-0000-4000-8000-000000000001",
    },
  },
});
