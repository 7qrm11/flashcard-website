import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { encrypt } from "@/server/encryption";
import { publishUserEvent } from "@/server/events";
import {
  normalizeOpenrouterFlashcardPrompt,
  normalizeOpenrouterSystemPrompt,
} from "@/shared/openrouter-defaults";
import { updateOpenrouterSettingsSchema } from "@/shared/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = updateOpenrouterSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const provider = parsed.data.provider ?? null;
  const apiKey = parsed.data.apiKey.trim();
  const cerebrasApiKey = parsed.data.cerebrasApiKey?.trim() ?? null;
  const groqApiKey = parsed.data.groqApiKey?.trim() ?? null;
  const model = parsed.data.model.trim();
  const systemPrompt = normalizeOpenrouterSystemPrompt(parsed.data.systemPrompt);
  const flashcardPrompt = normalizeOpenrouterFlashcardPrompt(parsed.data.flashcardPrompt);
  const paramsPatch = parsed.data.params ?? null;
  const languageLockEnabled =
    parsed.data.languageLockEnabled === undefined ? null : Boolean(parsed.data.languageLockEnabled);

  const pool = getPool();

  const paramsJson = (() => {
    if (!paramsPatch) {
      return null;
    }
    return pool
      .query("select openrouter_params from users where id = $1 limit 1", [user.id])
      .then((res) => {
        const raw = (res.rows[0] as any)?.openrouter_params;
        const current =
          raw && typeof raw === "object" && !Array.isArray(raw)
            ? ({ ...(raw as Record<string, unknown>) } as Record<string, unknown>)
            : {};

        for (const [key, value] of Object.entries(paramsPatch)) {
          if (value === undefined) {
            continue;
          }
          if (value === null) {
            delete current[key];
            continue;
          }
          current[key] = value;
        }

        return JSON.stringify(current);
      });
  })();

  await pool.query(
    `
      update users
      set openrouter_api_key = $1,
          openrouter_model = $2,
          openrouter_only_free_models = $3,
          openrouter_system_prompt = $4,
          openrouter_flashcard_prompt = $5,
          openrouter_params = coalesce($6::jsonb, openrouter_params),
          ai_language_lock_enabled = coalesce($7, ai_language_lock_enabled),
          ai_provider = coalesce($8, ai_provider),
          cerebras_api_key = coalesce($9, cerebras_api_key),
          groq_api_key = coalesce($10, groq_api_key)
      where id = $11
    `,
    [
      apiKey.length > 0 ? encrypt(apiKey) : null,
      model.length > 0 ? model : null,
      Boolean(parsed.data.onlyFreeModels),
      systemPrompt,
      flashcardPrompt,
      paramsJson ? await paramsJson : null,
      languageLockEnabled,
      provider,
      cerebrasApiKey && cerebrasApiKey.length > 0 ? encrypt(cerebrasApiKey) : null,
      groqApiKey && groqApiKey.length > 0 ? encrypt(groqApiKey) : null,
      user.id,
    ],
  );

  publishUserEvent(user.id, { type: "sync" });
  return NextResponse.json({ ok: true });
}
