import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ALLOWED_USER_IDS: z
    .string()
    .min(1, "ALLOWED_USER_IDS must name the owner")
    .transform((value) => value.split(",").map((id) => id.trim()))
    .pipe(z.array(z.string().uuid()).min(1)),
  SUPABASE_JWKS_URL: z.string().url("SUPABASE_JWKS_URL must be a valid URL"),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
