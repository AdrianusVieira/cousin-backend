import "dotenv/config";
import { z } from "zod";

const csv = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_JWKS_URL: z.string().url("SUPABASE_JWKS_URL must be a valid URL"),
  ALLOWED_USER_IDS: csv.refine((ids) => ids.length > 0, "ALLOWED_USER_IDS is required"),
  CORS_ORIGIN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
