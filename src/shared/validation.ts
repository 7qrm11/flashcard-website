import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const usernameSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9_.]+$/);

export const passwordSchema = z.string().min(1).max(64);

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  passwordConfirm: passwordSchema,
});

export const updateUsernameSchema = z.object({
  newUsername: usernameSchema,
  password: passwordSchema,
});

export const updatePasswordSchema = z.object({
  oldPassword: passwordSchema,
  newPassword: passwordSchema,
  newPasswordConfirm: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: passwordSchema,
  confirm: z.literal("delete"),
});

export const themeModeSchema = z.enum(["light", "dark"]);

export const updateThemeSchema = z.object({
  mode: themeModeSchema,
});

export const deckNameSchema = z.string().trim().min(1).max(64);

export const createDeckSchema = z.object({
  name: deckNameSchema,
});

export const updateDeckSchema = z.object({
  name: deckNameSchema,
});

export const setDeckArchivedSchema = z.object({
  archived: z.boolean(),
});

export const flashcardTextSchema = z.string().trim().min(1).max(50000);

export const flashcardKindSchema = z.enum(["basic", "mcq"]);

export const flashcardMcqSchema = z.object({
  options: z.array(flashcardTextSchema).min(2).max(8),
  correctIndex: z.number().int().min(0).max(7),
});

export const flashcardP5Schema = z.object({
  width: z.number().int().min(100).max(1200).nullable().optional(),
  height: z.number().int().min(100).max(900).nullable().optional(),
  code: z.string().max(40_000),
});

export const createFlashcardSchema = z.object({
  kind: flashcardKindSchema.optional(),
  front: flashcardTextSchema,
  back: flashcardTextSchema,
  mcq: flashcardMcqSchema.optional(),
  p5: flashcardP5Schema.optional(),
});

export const updateFlashcardSchema = z.object({
  kind: flashcardKindSchema.optional(),
  front: flashcardTextSchema.optional(),
  back: flashcardTextSchema.optional(),
  mcq: flashcardMcqSchema.nullable().optional(),
  p5: flashcardP5Schema.nullable().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateDailyLimitsSchema = z.object({
  dailyNovelLimit: z.number().int().min(0).max(10000),
  dailyReviewLimit: z.number().int().min(0).max(10000),
});

export const updateSchedulerSettingsSchema = z.object({
  baseIntervalMinutes: z.number().int().min(1).max(525600),
  requiredTimeSeconds: z.number().int().min(0).max(3600),
  rewardMultiplier: z.number().min(0.0001).max(1000),
  penaltyMultiplier: z.number().min(0.0001).max(1000),
  timeHistoryLimit: z.number().int().min(1).max(1000),
});

export const updateLoggingSettingsSchema = z.object({
  loggingEnabled: z.boolean(),
  retentionDays: z.number().int().min(0).max(3650),
  aiDeckJobLogsEnabled: z.boolean(),
  aiDeckJobLogsRetentionDays: z.number().int().min(0).max(3650),
});

export const openrouterApiKeySchema = z.string().max(512);
export const openrouterModelSchema = z.string().max(128);
export const openrouterPromptSchema = z.string().max(8000);

export const updateOpenrouterSettingsSchema = z.object({
  provider: z.enum(["openrouter", "cerebras", "groq"]).optional(),
  apiKey: openrouterApiKeySchema,
  cerebrasApiKey: openrouterApiKeySchema.optional(),
  groqApiKey: openrouterApiKeySchema.optional(),
  model: openrouterModelSchema,
  onlyFreeModels: z.boolean(),
  systemPrompt: openrouterPromptSchema,
  flashcardPrompt: openrouterPromptSchema,
  languageLockEnabled: z.boolean().optional(),
  params: z
    .object({
      temperature: z.number().min(0).max(5).nullable().optional(),
      top_p: z.number().min(0).max(1).nullable().optional(),
      top_k: z.number().int().min(0).max(1000000).nullable().optional(),
      max_tokens: z.number().int().min(1).max(1000000).nullable().optional(),
      frequency_penalty: z.number().min(-2).max(2).nullable().optional(),
      presence_penalty: z.number().min(-2).max(2).nullable().optional(),
      repetition_penalty: z.number().min(0).max(10).nullable().optional(),
    })
    .optional(),
});

export const createAiDeckJobSchema = z.object({
  prompt: z.string().trim().min(1).max(50000),
  mode: z.enum(["add", "edit"]).optional(),
  youtubeUrl: z.string().max(500).optional(),
});
