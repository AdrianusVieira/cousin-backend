import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_JWKS_URL: z.string().url("SUPABASE_JWKS_URL must be a valid URL"),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
