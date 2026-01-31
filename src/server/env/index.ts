import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),

  OPENROUTER_SITE_URL: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  OPENROUTER_APP_TITLE: z.string().optional(),
});

export const env = envSchema.parse(process.env);
