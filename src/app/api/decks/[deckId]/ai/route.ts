import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { startAiDeckJob } from "@/server/ai-deck-worker";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { serverLog } from "@/server/log";
import { extractPdfText } from "@/server/pdf-parser";
import { fetchYoutubeTranscript } from "@/server/youtube-transcript";
import { checkRateLimit, makeRateLimitBucket } from "@/server/rate-limit";
import {
  normalizeOpenrouterFlashcardPrompt,
  normalizeOpenrouterSystemPrompt,
} from "@/shared/openrouter-defaults";
import { createAiDeckJobSchema, uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100mb

type SourceInfo = {
  type: "pdf" | "youtube" | null;
  name: string | null;
  content: string | null;
};

async function parseRequest(request: Request): Promise<
  | { ok: true; prompt: string; mode: "add" | "edit"; source: SourceInfo }
  | { ok: false; error: string; status: number }
> {
  const contentType = request.headers.get("content-type") ?? "";

  // handle multipart form data (pdf upload)
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return { ok: false, error: "invalid form data", status: 400 };
    }

    const prompt = String(formData.get("prompt") ?? "").trim();
    if (prompt.length < 1 || prompt.length > 50000) {
      return { ok: false, error: "invalid input", status: 400 };
    }

    const modeRaw = String(formData.get("mode") ?? "add");
    const mode = modeRaw === "edit" ? "edit" : "add";

    const file = formData.get("pdf");
    if (file && file instanceof File) {
      if (file.size > MAX_PDF_SIZE) {
        return { ok: false, error: "pdf file is too large", status: 400 };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await extractPdfText(buffer);

      if (!result.ok) {
        return { ok: false, error: result.error, status: 400 };
      }

      return {
        ok: true,
        prompt,
        mode,
        source: {
          type: "pdf",
          name: file.name || "uploaded.pdf",
          content: result.text,
        },
      };
    }

    return {
      ok: true,
      prompt,
      mode,
      source: { type: null, name: null, content: null },
    };
  }

  // handle json
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "invalid request", status: 400 };
  }

  const parsed = createAiDeckJobSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "invalid input", status: 400 };
  }

  const prompt = parsed.data.prompt.trim();
  const mode = parsed.data.mode === "edit" ? "edit" : "add";

  if (parsed.data.youtubeUrl && parsed.data.youtubeUrl.trim().length > 0) {
    const result = await fetchYoutubeTranscript(parsed.data.youtubeUrl);

    if (!result.ok) {
      return { ok: false, error: result.error, status: 400 };
    }

    return {
      ok: true,
      prompt,
      mode,
      source: {
        type: "youtube",
        name: result.videoId,
        content: result.text,
      },
    };
  }

  return {
    ok: true,
    prompt,
    mode,
    source: { type: null, name: null, content: null },
  };
}

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

  const parseResult = await parseRequest(request);
  if (!parseResult.ok) {
    return NextResponse.json({ error: parseResult.error }, { status: parseResult.status });
  }

  const { prompt, mode, source } = parseResult;

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
    mode,
    promptLength: prompt.length,
    model: settings.openrouter_model.trim(),
    systemPromptLength: systemPrompt.length,
    flashcardPromptLength: flashcardPrompt.length,
    sourceType: source.type,
    sourceName: source.name,
    sourceContentLength: source.content?.length ?? 0,
  });

  const jobType = mode === "edit" ? "edit_flashcards" : "add_flashcards";

  const insertRes = await pool.query(
    `
      insert into ai_deck_jobs
        (user_id, status, prompt, model, system_prompt, flashcard_prompt, attempt_count, started_at, deck_id, job_type, source_type, source_name, source_content)
      values ($1, 'running', $2, $3, $4, $5, 1, now(), $6, $7, $8, $9, $10)
      returning id
    `,
    [
      user.id,
      prompt,
      settings.openrouter_model.trim(),
      systemPrompt,
      flashcardPrompt,
      deckIdParsed.data,
      jobType,
      source.type,
      source.name,
      source.content,
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
    sourceType: source.type,
  });
  startAiDeckJob(jobId);
  publishUserEvent(user.id, { type: "ai_deck_job_changed", jobId });

  return NextResponse.json({ ok: true, jobId });
}
