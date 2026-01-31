import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { startAiDeckJob } from "@/server/ai-deck-worker";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { serverLog } from "@/server/log";
import { checkRateLimit, makeRateLimitBucket } from "@/server/rate-limit";
import {
  normalizeOpenrouterFlashcardPrompt,
  normalizeOpenrouterSystemPrompt,
} from "@/shared/openrouter-defaults";
import { createAiDeckJobSchema, uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: Readonly<{ params: { deckId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deckIdParsed = uuidSchema.safeParse(params.deckId);
  if (!deckIdParsed.success) {
    return NextResponse.json({ error: "Invalid deck id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = createAiDeckJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const pool = getPool();
  const allowed = await checkRateLimit(
    pool,
    makeRateLimitBucket("ai_flashcards_add_user", user.id),
    { windowMs: 60 * 60 * 1000, max: 30 },
  );
  if (!allowed) {
    return NextResponse.json({ error: "rate limit reached" }, { status: 429 });
  }

  const deckRes = await pool.query(
    "select id, name, is_archived from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );
  const deckRow = deckRes.rows[0] as { id: string; name: string; is_archived: boolean } | undefined;
  if (!deckRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (deckRow.is_archived) {
    return NextResponse.json({ error: "deck is archived" }, { status: 409 });
  }

  const settingsRes = await pool.query(
    `
      select
        openrouter_api_key,
        openrouter_model,
        openrouter_system_prompt,
        openrouter_flashcard_prompt,
        ai_deck_job_logs_enabled,
        ai_deck_job_logs_retention_ms
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );
  const settings = settingsRes.rows[0] as
    | {
        openrouter_api_key: string | null;
        openrouter_model: string | null;
        openrouter_system_prompt: string;
        openrouter_flashcard_prompt: string;
      }
    | undefined;

  if (!settings?.openrouter_api_key || settings.openrouter_api_key.trim().length === 0) {
    return NextResponse.json(
      { error: "set your openrouter api key in settings first" },
      { status: 409 },
    );
  }
  if (!settings.openrouter_model || settings.openrouter_model.trim().length === 0) {
    return NextResponse.json(
      { error: "select an openrouter model in settings first" },
      { status: 409 },
    );
  }

  const systemPrompt = normalizeOpenrouterSystemPrompt(settings.openrouter_system_prompt);
  const flashcardPrompt = normalizeOpenrouterFlashcardPrompt(settings.openrouter_flashcard_prompt);

  const aiJobLogsEnabled = (settings as any)?.ai_deck_job_logs_enabled !== false;
  const aiJobRetentionMsRaw = Number((settings as any)?.ai_deck_job_logs_retention_ms ?? 604800000);
  const aiJobRetentionMs = Number.isFinite(aiJobRetentionMsRaw) ? Math.max(0, aiJobRetentionMsRaw) : 604800000;

  if (!aiJobLogsEnabled || aiJobRetentionMs <= 0) {
    await pool.query(
      `
        delete from ai_deck_jobs
        where user_id = $1
          and status <> 'running'
      `,
      [user.id],
    );
  } else {
    await pool.query(
      `
        delete from ai_deck_jobs
        where user_id = $1
          and status in ('queued', 'succeeded', 'failed')
          and updated_at < now() - ($2::text || ' milliseconds')::interval
      `,
      [user.id, aiJobRetentionMs],
    );
  }

  serverLog("info", "ai flashcards: request", {
    userId: user.id,
    deckId: deckIdParsed.data,
    deckName: deckRow.name,
    mode: parsed.data.mode === "edit" ? "edit" : "add",
    promptLength: parsed.data.prompt.trim().length,
    model: settings.openrouter_model.trim(),
    systemPromptLength: systemPrompt.length,
    flashcardPromptLength: flashcardPrompt.length,
  });

  const mode = parsed.data.mode === "edit" ? "edit" : "add";
  const jobType = mode === "edit" ? "edit_flashcards" : "add_flashcards";

  const insertRes = await pool.query(
    `
      insert into ai_deck_jobs
        (user_id, status, prompt, model, system_prompt, flashcard_prompt, attempt_count, started_at, deck_id, job_type)
      values ($1, 'running', $2, $3, $4, $5, 1, now(), $6, $7)
      returning id
    `,
    [
      user.id,
      parsed.data.prompt.trim(),
      settings.openrouter_model.trim(),
      systemPrompt,
      flashcardPrompt,
      deckIdParsed.data,
      jobType,
    ],
  );

  const jobId = String(insertRes.rows[0]?.id);
  serverLog("info", "ai flashcards: started", {
    userId: user.id,
    deckId: deckIdParsed.data,
    deckName: deckRow.name,
    mode,
    jobType,
    jobId,
  });
  startAiDeckJob(jobId);
  publishUserEvent(user.id, { type: "ai_deck_job_changed", jobId });

  return NextResponse.json({ ok: true, jobId });
}
