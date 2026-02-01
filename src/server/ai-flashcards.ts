import "server-only";

import { z } from "zod";

export type NormalizedAiFlashcard = {
  kind: "basic" | "mcq";
  front: string;
  back: string;
  mcqOptions: string[] | null;
  mcqCorrectIndex: number | null;
  p5Code: string | null;
  p5Width: number | null;
  p5Height: number | null;
};

export type NormalizedAiFlashcardEdit = NormalizedAiFlashcard & { id: string };

const kindSchema = z.string().max(32).optional();

const aiFlashcardSchema = z
  .object({
    front: z.string().max(50000),
    back: z.string().max(50000),
    kind: kindSchema,
    type: kindSchema,
    mcq: z
      .object({
        options: z.array(z.string().max(50000)).min(2).max(8),
        correctIndex: z.number().int().min(0).max(7),
      })
      .optional(),
    choices: z.array(z.string().max(50000)).min(2).max(8).optional(),
    correctIndex: z.number().int().min(0).max(7).optional(),
    answerIndex: z.number().int().min(0).max(7).optional(),
    p5: z
      .object({
        width: z.number().int().min(100).max(1200).nullable().optional(),
        height: z.number().int().min(100).max(900).nullable().optional(),
        code: z.string().max(40_000),
      })
      .optional(),
    p5Code: z.string().max(40_000).optional(),
    p5Width: z.number().int().min(100).max(1200).nullable().optional(),
    p5Height: z.number().int().min(100).max(900).nullable().optional(),
  })
  .passthrough();

const aiFlashcardEditSchema = aiFlashcardSchema.extend({
  id: z.string().uuid(),
});

function normalizeMcq(value: {
  mcq?: { options: string[]; correctIndex: number };
  choices?: string[];
  correctIndex?: number;
  answerIndex?: number;
  [key: string]: unknown;
}) {
  const anyValue = value as any;

  const rawOptions =
    value.mcq?.options ??
    value.choices ??
    anyValue.mcqOptions ??
    anyValue.mcq_options ??
    anyValue.options ??
    null;
  const rawCorrect =
    value.mcq?.correctIndex ??
    value.correctIndex ??
    value.answerIndex ??
    anyValue.mcqCorrectIndex ??
    anyValue.mcq_correct_index ??
    anyValue.correct_index ??
    anyValue.correctAnswerIndex ??
    null;

  const optionsArray: unknown[] | null = Array.isArray(rawOptions)
    ? rawOptions
    : rawOptions && typeof rawOptions === "object"
      ? Object.entries(rawOptions as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v)
      : null;

  if (!optionsArray) {
    return { options: null as string[] | null, correctIndex: null as number | null };
  }

  const options = optionsArray.map((o) => String(o).trim());
  if (options.length < 2 || options.length > 8) {
    return { options: null, correctIndex: null };
  }
  if (options.some((o) => o.length === 0)) {
    return { options: null, correctIndex: null };
  }

  if (rawCorrect === null || rawCorrect === undefined) {
    return { options: null, correctIndex: null };
  }
  const parsedIndex = (() => {
    if (typeof rawCorrect === "string") {
      const trimmed = rawCorrect.trim();
      if (trimmed.length === 1) {
        const code = trimmed.toUpperCase().charCodeAt(0);
        const idx = code - 65;
        if (Number.isFinite(idx) && idx >= 0 && idx < 26) {
          return idx;
        }
      }
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return Math.floor(numeric);
      }
      return NaN;
    }
    return Math.floor(Number(rawCorrect));
  })();
  const correctIndex = parsedIndex;
  if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return { options: null, correctIndex: null };
  }

  return { options, correctIndex };
}

function normalizeP5(value: {
  p5?: { width?: number | null; height?: number | null; code: string };
  p5Code?: string;
  p5Width?: number | null;
  p5Height?: number | null;
  [key: string]: unknown;
}) {
  const anyValue = value as any;
  const codeRaw = value.p5?.code ?? value.p5Code ?? anyValue.p5_code ?? null;
  if (!codeRaw) {
    return { code: null as string | null, width: null as number | null, height: null as number | null };
  }
  const code = String(codeRaw).trim();
  if (code.length === 0) {
    return { code: null, width: null, height: null };
  }

  const widthRaw = value.p5?.width ?? value.p5Width ?? anyValue.p5_width ?? null;
  const heightRaw = value.p5?.height ?? value.p5Height ?? anyValue.p5_height ?? null;
  const width = widthRaw === null ? null : Math.floor(Number(widthRaw));
  const height = heightRaw === null ? null : Math.floor(Number(heightRaw));
  if (
    width === null ||
    height === null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 100 ||
    width > 1200 ||
    height < 100 ||
    height > 900
  ) {
    return { code, width: null, height: null };
  }

  return { code, width, height };
}

export function normalizeAiFlashcard(value: unknown): NormalizedAiFlashcard | null {
  const parsed = aiFlashcardSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const front = parsed.data.front.trim();
  const back = parsed.data.back.trim();
  if (front.length === 0 || back.length === 0) {
    return null;
  }

  const { options: mcqOptions, correctIndex: mcqCorrectIndex } = normalizeMcq(parsed.data);
  const { code: p5Code, width: p5Width, height: p5Height } = normalizeP5(parsed.data);

  const derivedKind = mcqOptions ? "mcq" : "basic";
  const kind = derivedKind;

  return {
    kind,
    front,
    back,
    mcqOptions,
    mcqCorrectIndex,
    p5Code,
    p5Width,
    p5Height,
  };
}

export function normalizeAiFlashcardEdit(value: unknown): NormalizedAiFlashcardEdit | null {
  const parsed = aiFlashcardEditSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const base = normalizeAiFlashcard(parsed.data);
  if (!base) {
    return null;
  }

  return { id: parsed.data.id, ...base };
}
