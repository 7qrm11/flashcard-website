import "server-only";

import { findAvailableDeckNameForUser } from "@/server/deck-import";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { extractJsonObjectAt, parseJsonLenient, tryExtractJsonStringValue } from "@/server/ai-json";
import { serverLog } from "@/server/log";
import {
  getOpenRouterModels,
  openRouterChatCompletionStream,
  type OpenRouterChatCompletionParams,
} from "@/server/openrouter";
import { normalizeAiFlashcard, normalizeAiFlashcardEdit } from "@/server/ai-flashcards";
import { deckNameSchema } from "@/shared/validation";
import { normalizeUiLanguage, uiLanguageName } from "@/shared/i18n";

const MAX_JOB_ATTEMPTS = 3;

type AiDeckJobType = "create_deck" | "add_flashcards" | "edit_flashcards";

function normalizeAiDeckJobType(value: unknown): AiDeckJobType {
  if (value === "add_flashcards") {
    return "add_flashcards";
  }
  if (value === "edit_flashcards") {
    return "edit_flashcards";
  }
  return "create_deck";
}

function fallbackDeckName(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) {
    return "ai deck";
  }
  return cleaned.length > 64 ? cleaned.slice(0, 64).trim() : cleaned;
}

function normalizeUserOpenrouterParams(raw: unknown): OpenRouterChatCompletionParams {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as any) : {};

  const out: OpenRouterChatCompletionParams = {};

  const copyNumber = (key: keyof OpenRouterChatCompletionParams) => {
    const value = obj[key];
    if (value === null || value === undefined) {
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return;
    }
    (out as any)[key] = num;
  };

  copyNumber("temperature");
  copyNumber("top_p");
  copyNumber("top_k");
  copyNumber("max_tokens");
  copyNumber("frequency_penalty");
  copyNumber("presence_penalty");
  copyNumber("repetition_penalty");

  return out;
}

async function filterSupportedParamsForModel(
  model: string,
  params: OpenRouterChatCompletionParams,
): Promise<OpenRouterChatCompletionParams> {
  const modelsRes = await getOpenRouterModels({ freeOnly: false });
  if (!modelsRes.ok) {
    return {};
  }
  const info = modelsRes.models.find((m) => m.id === model);
  const supported = info?.supportedParameters ?? [];
  if (supported.length === 0) {
    return {};
  }
  const supportedSet = new Set(supported);

  const filtered: OpenRouterChatCompletionParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (!supportedSet.has(key)) {
      continue;
    }
    (filtered as any)[key] = value;
  }
  return filtered;
}

async function loadAiDeckJobLogSettings(userId: string) {
  const pool = getPool();
  const res = await pool.query(
    `
      select ai_deck_job_logs_enabled, ai_deck_job_logs_retention_ms
      from users
      where id = $1
      limit 1
    `,
    [userId],
  );
  const row = res.rows[0] as
    | { ai_deck_job_logs_enabled?: boolean; ai_deck_job_logs_retention_ms?: number }
    | undefined;
  const enabled = row?.ai_deck_job_logs_enabled !== false;
  const retentionMsRaw = Number(row?.ai_deck_job_logs_retention_ms ?? 604800000);
  const retentionMs = Number.isFinite(retentionMsRaw) ? Math.max(0, retentionMsRaw) : 604800000;
  return { enabled, retentionMs };
}

async function pruneAiDeckJobsForUser(userId: string) {
  const { enabled, retentionMs } = await loadAiDeckJobLogSettings(userId);
  const pool = getPool();

  if (!enabled || retentionMs <= 0) {
    await pool.query(
      `
        delete from ai_deck_jobs
        where user_id = $1
          and status <> 'running'
      `,
      [userId],
    );
    return;
  }

  await pool.query(
    `
      delete from ai_deck_jobs
      where user_id = $1
        and status in ('queued', 'succeeded', 'failed')
        and updated_at < now() - ($2::text || ' milliseconds')::interval
    `,
    [userId, retentionMs],
  );
}

async function createDeck(userId: string, baseName: string) {
  const pool = getPool();
  const name = await findAvailableDeckNameForUser(userId, baseName, "ai");
  const res = await pool.query(
    "insert into decks (user_id, name, is_default, is_archived) values ($1, $2, false, false) returning id",
    [userId, name],
  );
  return { id: String(res.rows[0]?.id), name };
}

async function renameDeck(userId: string, deckId: string, desiredName: string) {
  const pool = getPool();
  const name = await findAvailableDeckNameForUser(userId, desiredName, "ai", deckId);
  await pool.query("update decks set name = $1 where id = $2 and user_id = $3", [
    name,
    deckId,
    userId,
  ]);
  return name;
}

async function attachDeckToJob(jobId: string, userId: string, deckId: string) {
  const pool = getPool();
  await pool.query(
    `
      update ai_deck_jobs
      set deck_id = $2,
          updated_at = now()
      where id = $1
        and user_id = $3
        and deck_id is null
    `,
    [jobId, deckId, userId],
  );
  publishUserEvent(userId, { type: "ai_deck_job_changed", jobId });
}

async function deleteDeckIfEmpty(userId: string, deckId: string) {
  const pool = getPool();
  const countRes = await pool.query(
    "select count(*)::int as count from flashcards where deck_id = $1",
    [deckId],
  );
  const count = Number(countRes.rows[0]?.count ?? 0);
  if (count > 0) {
    return;
  }
  await pool.query("delete from decks where id = $1 and user_id = $2", [deckId, userId]);
}

async function markStuckJobs() {
  const pool = getPool();
  const res = await pool.query(
    `
      update ai_deck_jobs
      set
        status = 'failed',
        started_at = null,
        updated_at = now(),
        error = case
          when error is null then 'job timed out'
          else error
        end
      where status = 'running'
        and started_at is not null
        and started_at < now() - interval '15 minutes'
      returning user_id
    `,
  );
  const count = res.rowCount ?? 0;
  if (count > 0) {
    serverLog("warn", "ai deck worker: marked stuck jobs", { count });
    const userIds = new Set<string>();
    for (const row of res.rows as any[]) {
      if (row?.user_id) {
        userIds.add(String(row.user_id));
      }
    }
    for (const userId of userIds) {
      publishUserEvent(userId, { type: "ai_deck_job_changed", jobId: "" });
      await pruneAiDeckJobsForUser(userId);
    }
  }
}

async function claimJob(jobId: string) {
  const pool = getPool();
  const res = await pool.query(
    `
      update ai_deck_jobs
      set
        status = 'running',
        started_at = now(),
        attempt_count = attempt_count + 1,
        updated_at = now()
      where id = $1
        and status = 'queued'
        and attempt_count < $2
      returning user_id, deck_id, job_type, prompt, model, system_prompt, flashcard_prompt, attempt_count
    `,
    [jobId, MAX_JOB_ATTEMPTS],
  );

  const row = res.rows[0] as
    | {
        user_id: string;
        deck_id: string | null;
        job_type: string | null;
        prompt: string;
        model: string;
        system_prompt: string;
        flashcard_prompt: string;
        attempt_count: number;
      }
    | undefined;
  if (!row) {
    return null;
  }

  return {
    id: jobId,
    userId: String(row.user_id),
    deckId: row.deck_id ? String(row.deck_id) : null,
    jobType: normalizeAiDeckJobType(row.job_type),
    prompt: String(row.prompt),
    model: String(row.model),
    systemPrompt: String(row.system_prompt),
    flashcardPrompt: String(row.flashcard_prompt),
    attempt: Math.max(1, Number(row.attempt_count ?? 1)),
  };
}

async function loadJob(jobId: string) {
  const pool = getPool();
  const res = await pool.query(
    `
      select id, user_id, deck_id, job_type, prompt, model, system_prompt, flashcard_prompt, attempt_count, status
      from ai_deck_jobs
      where id = $1
      limit 1
    `,
    [jobId],
  );
  const row = res.rows[0] as
    | {
        id: string;
        user_id: string;
        deck_id: string | null;
        job_type: string | null;
        prompt: string;
        model: string;
        system_prompt: string;
        flashcard_prompt: string;
        attempt_count: number;
        status: "queued" | "running" | "succeeded" | "failed";
      }
    | undefined;
  if (!row) {
    return null;
  }

  const status =
    row.status === "queued" || row.status === "running" || row.status === "succeeded" || row.status === "failed"
      ? row.status
      : "failed";

  return {
    id: String(row.id),
    userId: String(row.user_id),
    deckId: row.deck_id ? String(row.deck_id) : null,
    jobType: normalizeAiDeckJobType(row.job_type),
    prompt: String(row.prompt),
    model: String(row.model),
    systemPrompt: String(row.system_prompt),
    flashcardPrompt: String(row.flashcard_prompt),
    attempt: Math.max(1, Number(row.attempt_count ?? 0)),
    status,
  };
}

async function failJob(jobId: string, userId: string, message: string) {
  const pool = getPool();
  await pool.query(
    `
      update ai_deck_jobs
      set status = 'failed',
          updated_at = now(),
          error = $2
      where id = $1
        and user_id = $3
    `,
    [jobId, message, userId],
  );
  serverLog("warn", "ai deck job: failed", { jobId, userId, message });
  publishUserEvent(userId, { type: "ai_deck_job_changed", jobId });
  await pruneAiDeckJobsForUser(userId);
}

async function succeedJob(jobId: string, userId: string, deckId: string) {
  const pool = getPool();
  await pool.query(
    `
      update ai_deck_jobs
      set status = 'succeeded',
          updated_at = now(),
          deck_id = $2,
          error = null
      where id = $1
        and user_id = $3
    `,
    [jobId, deckId, userId],
  );
  serverLog("info", "ai deck job: succeeded", { jobId, userId, deckId });
  publishUserEvent(userId, { type: "decks_changed" });
  await pruneAiDeckJobsForUser(userId);
}

async function processAddFlashcardsJob(job: {
  id: string;
  userId: string;
  deckId: string;
  prompt: string;
  model: string;
  systemPrompt: string;
  flashcardPrompt: string;
  attempt: number;
}) {
  const pool = getPool();
  serverLog("info", "ai add flashcards job: start", {
    jobId: job.id,
    userId: job.userId,
    deckId: job.deckId,
    attempt: job.attempt,
    model: job.model,
    promptLength: job.prompt.length,
  });
  serverLog("info", "ai add flashcards job: prompts", {
    jobId: job.id,
    userId: job.userId,
    systemPromptLength: job.systemPrompt.length,
    flashcardPromptLength: job.flashcardPrompt.length,
  });

  const userRes = await pool.query(
    "select openrouter_api_key, openrouter_params, ui_language, ai_language_lock_enabled from users where id = $1 limit 1",
    [job.userId],
  );
  const userRow = userRes.rows[0] as
    | {
        openrouter_api_key: string | null;
        openrouter_params?: unknown;
        ui_language?: unknown;
        ai_language_lock_enabled?: unknown;
      }
    | undefined;
  const apiKey = userRow?.openrouter_api_key ?? "";
  if (!apiKey || apiKey.trim().length === 0) {
    await failJob(job.id, job.userId, "missing openrouter api key (set it in settings)");
    return;
  }

  const uiLanguage = normalizeUiLanguage(userRow?.ui_language);
  const languageLockEnabled = userRow?.ai_language_lock_enabled !== false;
  const params = await filterSupportedParamsForModel(
    job.model,
    normalizeUserOpenrouterParams(userRow?.openrouter_params),
  );

  const deckRes = await pool.query(
    `
      select id, name, is_archived
      from decks
      where id = $1
        and user_id = $2
      limit 1
    `,
    [job.deckId, job.userId],
  );
  const deckRow = deckRes.rows[0] as { id: string; name: string; is_archived: boolean } | undefined;
  if (!deckRow) {
    await failJob(job.id, job.userId, "deck not found");
    return;
  }
  if (deckRow.is_archived) {
    await failJob(job.id, job.userId, "deck is archived");
    return;
  }

  const flashcardsRes = await pool.query(
    `
      select
        id,
        kind,
        front,
        back,
        mcq_options,
        mcq_correct_index,
        p5_code,
        p5_width,
        p5_height,
        created_at
      from flashcards
      where deck_id = $1
      order by created_at asc, id asc
    `,
    [deckRow.id],
  );

  const existingFlashcards = (flashcardsRes.rows as any[]).map((r) => {
    const kind = r.kind === "mcq" ? "mcq" : "basic";
    const mcqOptions = Array.isArray(r.mcq_options)
      ? (r.mcq_options as unknown[]).map((v) => String(v))
      : null;
    const mcqCorrectIndex =
      r.mcq_correct_index === null || r.mcq_correct_index === undefined
        ? null
        : Number(r.mcq_correct_index);
    const p5Code = typeof r.p5_code === "string" ? String(r.p5_code) : null;
    const p5Width = r.p5_width === null || r.p5_width === undefined ? null : Number(r.p5_width);
    const p5Height = r.p5_height === null || r.p5_height === undefined ? null : Number(r.p5_height);

    const card: any = {
      kind,
      front: String(r.front ?? ""),
      back: String(r.back ?? ""),
    };

    if (kind === "mcq" && mcqOptions && mcqOptions.length > 0 && mcqCorrectIndex !== null) {
      card.mcq = { options: mcqOptions, correctIndex: mcqCorrectIndex };
    }

    if (p5Code && p5Code.trim().length > 0) {
      card.p5 = { width: p5Width, height: p5Height, code: p5Code };
    }

    return card;
  });

  const existingFlashcardsJson = JSON.stringify(existingFlashcards);

  const systemParts = [job.systemPrompt.trim(), job.flashcardPrompt.trim()].filter((p) => p.length > 0);
  const system = [
    ...systemParts,
    ...(languageLockEnabled
      ? [
          `language lock: output all flashcard text in ${uiLanguageName(uiLanguage)} only.`,
          "do not use any other language in front/back/options.",
        ]
      : []),
    "you are adding flashcards to an existing deck.",
    "the user message contains the full deck context including existing flashcards. do not create duplicates.",
    "output must be valid json only.",
  ].join("\n\n");

  const userContent = [
    `deck: ${deckRow.name}`,
    `existing_flashcards_json: ${existingFlashcardsJson}`,
    `request: ${job.prompt.trim()}`,
  ].join("\n\n");

  const completion = await openRouterChatCompletionStream({
    apiKey,
    model: job.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    params,
  });

  if (!completion.ok) {
    serverLog("warn", "ai add flashcards job: openrouter request failed", {
      jobId: job.id,
      userId: job.userId,
      status: completion.status,
      error: completion.error,
    });
    if (completion.status === 401) {
      await failJob(job.id, job.userId, "openrouter rejected the api key");
      return;
    }
    if (completion.status === 429) {
      await failJob(job.id, job.userId, "openrouter rate limit reached");
      return;
    }
    await failJob(job.id, job.userId, completion.error);
    return;
  }

  let buffer = "";
  let inserted = 0;
  let scanFrom = 0;
  let lastPublishMs = 0;
  let insertErrors = 0;
  let insertedBasic = 0;
  let insertedMcq = 0;
  let extractedObjects = 0;
  let jsonParseErrors = 0;
  let normalizedRejected = 0;
  let duplicateFronts = 0;
  let invalidMcqShape = 0;
  const sampleInserted: Array<{ kind: string; front: string }> = [];
  const sampleInvalidMcq: Array<{ reason: string; json: string }> = [];
  const seenFronts = new Set<string>();
  let totalChars = 0;
  let outputPreviewStart = "";
  let outputPreviewEnd = "";
  const maxPreviewStart = 4000;
  const maxPreviewEnd = 2000;

  const publishDecksChanged = (force?: boolean) => {
    const now = Date.now();
    if (!force && now - lastPublishMs < 600) {
      return;
    }
    lastPublishMs = now;
    publishUserEvent(job.userId, { type: "decks_changed" });
  };

  try {
    for await (const chunk of completion.stream) {
      buffer += chunk;
      totalChars += chunk.length;
      if (outputPreviewStart.length < maxPreviewStart) {
        outputPreviewStart += chunk.slice(0, Math.max(0, maxPreviewStart - outputPreviewStart.length));
      }
      outputPreviewEnd = (outputPreviewEnd + chunk).slice(Math.max(0, outputPreviewEnd.length + chunk.length - maxPreviewEnd));

      while (true) {
        const frontIdx = buffer.indexOf("\"front\"", scanFrom);
        if (frontIdx < 0) {
          break;
        }

        const objectStart = buffer.lastIndexOf("{", frontIdx);
        if (objectStart < 0) {
          scanFrom = frontIdx + 7;
          continue;
        }

        const extracted = extractJsonObjectAt(buffer, objectStart);
        if (!extracted) {
          break;
        }

        scanFrom = extracted.endIndex + 1;
        extractedObjects += 1;
        const parsed = parseJsonLenient(extracted.json);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
          jsonParseErrors += 1;
          continue;
        }

        const anyValue = parsed.value as any;
        const hasMcqShape =
          anyValue?.mcq !== undefined ||
          anyValue?.choices !== undefined ||
          anyValue?.options !== undefined ||
          anyValue?.mcqOptions !== undefined ||
          anyValue?.mcq_options !== undefined ||
          anyValue?.mcqCorrectIndex !== undefined ||
          anyValue?.mcq_correct_index !== undefined ||
          anyValue?.correctIndex !== undefined ||
          anyValue?.answerIndex !== undefined ||
          anyValue?.correct_index !== undefined ||
          anyValue?.correctAnswerIndex !== undefined;

        const card = normalizeAiFlashcard(parsed.value);
        if (!card) {
          normalizedRejected += 1;
          if (hasMcqShape && sampleInvalidMcq.length < 3) {
            sampleInvalidMcq.push({
              reason: "invalid flashcard shape",
              json: extracted.json.slice(0, 2000),
            });
          }
          continue;
        }

        if (hasMcqShape && !card.mcqOptions) {
          invalidMcqShape += 1;
          if (sampleInvalidMcq.length < 3) {
            sampleInvalidMcq.push({
              reason: "mcq fields present but normalization failed",
              json: extracted.json.slice(0, 2000),
            });
          }
        }

        const frontKey = card.front.trim().toLowerCase();
        if (!frontKey || seenFronts.has(frontKey)) {
          duplicateFronts += 1;
          continue;
        }
        seenFronts.add(frontKey);

        try {
          const insertRes = await pool.query(
            `
              insert into flashcards
                (deck_id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height)
              values
                ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
              on conflict do nothing
            `,
            [
              deckRow.id,
              card.kind,
              card.front,
              card.back,
              card.mcqOptions ? JSON.stringify(card.mcqOptions) : null,
              card.mcqCorrectIndex,
              card.p5Code,
              card.p5Width,
              card.p5Height,
            ],
          );
            const rowCount = insertRes.rowCount ?? 0;
            if (rowCount > 0) {
              inserted += 1;
              if (card.kind === "mcq") {
                insertedMcq += 1;
              } else {
                insertedBasic += 1;
              }
              if (sampleInserted.length < 25) {
                sampleInserted.push({ kind: card.kind, front: card.front.slice(0, 200) });
            }
            publishDecksChanged(false);
            if (inserted % 100 === 0) {
              serverLog("info", "ai add flashcards job: inserted flashcards", {
                jobId: job.id,
                userId: job.userId,
                deckId: deckRow.id,
                inserted,
              });
            }
          }
        } catch (err) {
          insertErrors += 1;
          if (insertErrors <= 3) {
            serverLog("warn", "ai add flashcards job: flashcard insert failed", {
              jobId: job.id,
              userId: job.userId,
              deckId: deckRow.id,
              inserted,
              err,
            });
          }
        }

        if (inserted >= 10_000) {
          break;
        }
      }

      if (scanFrom > 40_000) {
        buffer = buffer.slice(scanFrom);
        scanFrom = 0;
      }
      if (inserted >= 10_000) {
        break;
      }
    }
  } catch (err) {
    serverLog("error", "ai add flashcards job: openrouter stream failed", {
      jobId: job.id,
      userId: job.userId,
      deckId: deckRow.id,
      inserted,
      err,
    });
    const message =
      (err as any)?.name === "AbortError" || String((err as any)?.message ?? "").includes("timed out")
        ? "openrouter stream timed out"
        : "openrouter stream failed";
    await failJob(job.id, job.userId, message);
    return;
  }

  if (inserted === 0) {
    serverLog("warn", "ai add flashcards job: no usable flashcards", {
      jobId: job.id,
      userId: job.userId,
      deckId: deckRow.id,
      totalChars,
      extractedObjects,
      jsonParseErrors,
      normalizedRejected,
      duplicateFronts,
      invalidMcqShape,
      outputPreviewStart,
      outputPreviewEnd,
      sampleInvalidMcq,
    });
    await failJob(job.id, job.userId, "model did not generate any usable flashcards");
    return;
  }

  serverLog("info", "ai add flashcards job: completed", {
    jobId: job.id,
    userId: job.userId,
    deckId: deckRow.id,
    inserted,
    insertedBasic,
    insertedMcq,
    totalChars,
    extractedObjects,
    jsonParseErrors,
    normalizedRejected,
    duplicateFronts,
    invalidMcqShape,
    outputPreviewStart,
    outputPreviewEnd,
    sampleInserted,
    sampleInvalidMcq,
  });
  await succeedJob(job.id, job.userId, deckRow.id);
}

async function processEditFlashcardsJob(job: {
  id: string;
  userId: string;
  deckId: string;
  prompt: string;
  model: string;
  systemPrompt: string;
  flashcardPrompt: string;
  attempt: number;
}) {
  const pool = getPool();
  serverLog("info", "ai edit flashcards job: start", {
    jobId: job.id,
    userId: job.userId,
    deckId: job.deckId,
    attempt: job.attempt,
    model: job.model,
    promptLength: job.prompt.length,
  });
  serverLog("info", "ai edit flashcards job: prompts", {
    jobId: job.id,
    userId: job.userId,
    systemPromptLength: job.systemPrompt.length,
    flashcardPromptLength: job.flashcardPrompt.length,
  });

  const userRes = await pool.query(
    "select openrouter_api_key, openrouter_params, ui_language, ai_language_lock_enabled from users where id = $1 limit 1",
    [job.userId],
  );
  const userRow = userRes.rows[0] as
    | {
        openrouter_api_key: string | null;
        openrouter_params?: unknown;
        ui_language?: unknown;
        ai_language_lock_enabled?: unknown;
      }
    | undefined;
  const apiKey = userRow?.openrouter_api_key ?? "";
  if (!apiKey || apiKey.trim().length === 0) {
    await failJob(job.id, job.userId, "missing openrouter api key (set it in settings)");
    return;
  }

  const uiLanguage = normalizeUiLanguage(userRow?.ui_language);
  const languageLockEnabled = userRow?.ai_language_lock_enabled !== false;
  const params = await filterSupportedParamsForModel(
    job.model,
    normalizeUserOpenrouterParams(userRow?.openrouter_params),
  );

  const deckRes = await pool.query(
    `
      select id, name, is_archived
      from decks
      where id = $1
        and user_id = $2
      limit 1
    `,
    [job.deckId, job.userId],
  );
  const deckRow = deckRes.rows[0] as { id: string; name: string; is_archived: boolean } | undefined;
  if (!deckRow) {
    await failJob(job.id, job.userId, "deck not found");
    return;
  }
  if (deckRow.is_archived) {
    await failJob(job.id, job.userId, "deck is archived");
    return;
  }

  const flashcardsRes = await pool.query(
    `
      select
        id,
        kind,
        front,
        back,
        mcq_options,
        mcq_correct_index,
        p5_code,
        p5_width,
        p5_height,
        created_at
      from flashcards
      where deck_id = $1
      order by created_at asc, id asc
    `,
    [deckRow.id],
  );

  const existingFlashcards = (flashcardsRes.rows as any[]).map((r) => {
    const kind = r.kind === "mcq" ? "mcq" : "basic";
    const mcqOptions = Array.isArray(r.mcq_options)
      ? (r.mcq_options as unknown[]).map((v) => String(v))
      : null;
    const mcqCorrectIndex =
      r.mcq_correct_index === null || r.mcq_correct_index === undefined
        ? null
        : Number(r.mcq_correct_index);
    const p5Code = typeof r.p5_code === "string" ? String(r.p5_code) : null;
    const p5Width = r.p5_width === null || r.p5_width === undefined ? null : Number(r.p5_width);
    const p5Height = r.p5_height === null || r.p5_height === undefined ? null : Number(r.p5_height);

    const card: any = {
      id: String(r.id),
      kind,
      front: String(r.front ?? ""),
      back: String(r.back ?? ""),
    };

    if (kind === "mcq" && mcqOptions && mcqOptions.length > 0 && mcqCorrectIndex !== null) {
      card.mcq = { options: mcqOptions, correctIndex: mcqCorrectIndex };
    }

    if (p5Code && p5Code.trim().length > 0) {
      card.p5 = { width: p5Width, height: p5Height, code: p5Code };
    }

    return card;
  });

  const existingFlashcardsJson = JSON.stringify(existingFlashcards);
  const allowedIds = new Set(existingFlashcards.map((c) => String(c.id)));

  const systemParts = [job.systemPrompt.trim(), job.flashcardPrompt.trim()].filter((p) => p.length > 0);
  const system = [
    ...systemParts,
    ...(languageLockEnabled
      ? [
          `language lock: output all flashcard text in ${uiLanguageName(uiLanguage)} only.`,
          "do not use any other language in front/back/options.",
        ]
      : []),
    "you are editing flashcards in an existing deck.",
    "the user message contains the full deck context including existing flashcards with ids.",
    "do not create new flashcards. only output edits for existing ids.",
    "each edit must include the id and the full updated flashcard fields (front/back and any mcq/p5 fields needed).",
    "output must be valid json only.",
  ].join("\n\n");

  const userContent = [
    `deck: ${deckRow.name}`,
    `existing_flashcards_json: ${existingFlashcardsJson}`,
    `request: ${job.prompt.trim()}`,
  ].join("\n\n");

  const completion = await openRouterChatCompletionStream({
    apiKey,
    model: job.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    params,
  });

  if (!completion.ok) {
    serverLog("warn", "ai edit flashcards job: openrouter request failed", {
      jobId: job.id,
      userId: job.userId,
      status: completion.status,
      error: completion.error,
    });
    if (completion.status === 401) {
      await failJob(job.id, job.userId, "openrouter rejected the api key");
      return;
    }
    if (completion.status === 429) {
      await failJob(job.id, job.userId, "openrouter rate limit reached");
      return;
    }
    await failJob(job.id, job.userId, completion.error);
    return;
  }

  let buffer = "";
  let updated = 0;
  let scanFrom = 0;
  let lastPublishMs = 0;
  let updateErrors = 0;
  let extractedObjects = 0;
  let jsonParseErrors = 0;
  let normalizedRejected = 0;
  let unknownIds = 0;
  let duplicateIds = 0;
  const sampleUpdated: Array<{ id: string; kind: string; front: string }> = [];
  const seenIds = new Set<string>();
  let totalChars = 0;
  let outputPreviewStart = "";
  let outputPreviewEnd = "";
  const maxPreviewStart = 4000;
  const maxPreviewEnd = 2000;

  const publishDecksChanged = (force?: boolean) => {
    const now = Date.now();
    if (!force && now - lastPublishMs < 600) {
      return;
    }
    lastPublishMs = now;
    publishUserEvent(job.userId, { type: "decks_changed" });
  };

  try {
    for await (const chunk of completion.stream) {
      buffer += chunk;
      totalChars += chunk.length;
      if (outputPreviewStart.length < maxPreviewStart) {
        outputPreviewStart += chunk.slice(0, Math.max(0, maxPreviewStart - outputPreviewStart.length));
      }
      outputPreviewEnd = (outputPreviewEnd + chunk).slice(
        Math.max(0, outputPreviewEnd.length + chunk.length - maxPreviewEnd),
      );

      while (true) {
        const idIdx = buffer.indexOf("\"id\"", scanFrom);
        if (idIdx < 0) {
          break;
        }

        const objectStart = buffer.lastIndexOf("{", idIdx);
        if (objectStart < 0) {
          scanFrom = idIdx + 4;
          continue;
        }

        const extracted = extractJsonObjectAt(buffer, objectStart);
        if (!extracted) {
          break;
        }

        scanFrom = extracted.endIndex + 1;
        extractedObjects += 1;
        const parsed = parseJsonLenient(extracted.json);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
          jsonParseErrors += 1;
          continue;
        }

        const edit = normalizeAiFlashcardEdit(parsed.value);
        if (!edit) {
          normalizedRejected += 1;
          continue;
        }

        const id = String(edit.id);
        if (!allowedIds.has(id)) {
          unknownIds += 1;
          continue;
        }
        if (seenIds.has(id)) {
          duplicateIds += 1;
          continue;
        }
        seenIds.add(id);

        try {
          const updateRes = await pool.query(
            `
              update flashcards
              set
                kind = $1,
                front = $2,
                back = $3,
                mcq_options = $4::jsonb,
                mcq_correct_index = $5,
                p5_code = $6,
                p5_width = $7,
                p5_height = $8
              where id = $9
                and deck_id = $10
            `,
            [
              edit.kind,
              edit.front,
              edit.back,
              edit.mcqOptions ? JSON.stringify(edit.mcqOptions) : null,
              edit.mcqCorrectIndex,
              edit.p5Code,
              edit.p5Width,
              edit.p5Height,
              id,
              deckRow.id,
            ],
          );
          const rowCount = updateRes.rowCount ?? 0;
          if (rowCount > 0) {
            updated += 1;
            if (sampleUpdated.length < 25) {
              sampleUpdated.push({ id, kind: edit.kind, front: edit.front.slice(0, 200) });
            }
            publishDecksChanged(false);
            if (updated % 100 === 0) {
              serverLog("info", "ai edit flashcards job: updated flashcards", {
                jobId: job.id,
                userId: job.userId,
                deckId: deckRow.id,
                updated,
              });
            }
          }
        } catch (err) {
          updateErrors += 1;
          if (updateErrors <= 3) {
            serverLog("warn", "ai edit flashcards job: flashcard update failed", {
              jobId: job.id,
              userId: job.userId,
              deckId: deckRow.id,
              updated,
              err,
            });
          }
        }

        if (updated >= 10_000) {
          break;
        }
      }

      if (scanFrom > 40_000) {
        buffer = buffer.slice(scanFrom);
        scanFrom = 0;
      }
      if (updated >= 10_000) {
        break;
      }
    }
  } catch (err) {
    serverLog("error", "ai edit flashcards job: openrouter stream failed", {
      jobId: job.id,
      userId: job.userId,
      deckId: deckRow.id,
      updated,
      err,
    });
    const message =
      (err as any)?.name === "AbortError" || String((err as any)?.message ?? "").includes("timed out")
        ? "openrouter stream timed out"
        : "openrouter stream failed";
    await failJob(job.id, job.userId, message);
    return;
  }

  if (updated === 0) {
    serverLog("warn", "ai edit flashcards job: no usable edits", {
      jobId: job.id,
      userId: job.userId,
      deckId: deckRow.id,
      totalChars,
      extractedObjects,
      jsonParseErrors,
      normalizedRejected,
      unknownIds,
      duplicateIds,
      updateErrors,
      outputPreviewStart,
      outputPreviewEnd,
    });
    await failJob(job.id, job.userId, "model did not generate any usable edits");
    return;
  }

  serverLog("info", "ai edit flashcards job: completed", {
    jobId: job.id,
    userId: job.userId,
    deckId: deckRow.id,
    updated,
    totalChars,
    extractedObjects,
    jsonParseErrors,
    normalizedRejected,
    unknownIds,
    duplicateIds,
    updateErrors,
    outputPreviewStart,
    outputPreviewEnd,
    sampleUpdated,
  });
  await succeedJob(job.id, job.userId, deckRow.id);
}

async function processCreateDeckJob(job: {
  id: string;
  userId: string;
  prompt: string;
  model: string;
  systemPrompt: string;
  flashcardPrompt: string;
  attempt: number;
}) {
  const pool = getPool();
  serverLog("info", "ai deck job: start", {
    jobId: job.id,
    userId: job.userId,
    attempt: job.attempt,
    model: job.model,
    promptLength: job.prompt.length,
  });
  serverLog("info", "ai deck job: prompts", {
    jobId: job.id,
    userId: job.userId,
    systemPromptLength: job.systemPrompt.length,
    flashcardPromptLength: job.flashcardPrompt.length,
  });

  const userRes = await pool.query(
    "select openrouter_api_key, openrouter_params, ui_language, ai_language_lock_enabled from users where id = $1 limit 1",
    [job.userId],
  );
  const userRow = userRes.rows[0] as
    | {
        openrouter_api_key: string | null;
        openrouter_params?: unknown;
        ui_language?: unknown;
        ai_language_lock_enabled?: unknown;
      }
    | undefined;
  const apiKey = userRow?.openrouter_api_key ?? "";
  if (!apiKey || apiKey.trim().length === 0) {
    await failJob(job.id, job.userId, "missing openrouter api key (set it in settings)");
    return;
  }

  const uiLanguage = normalizeUiLanguage(userRow?.ui_language);
  const languageLockEnabled = userRow?.ai_language_lock_enabled !== false;
  const params = await filterSupportedParamsForModel(
    job.model,
    normalizeUserOpenrouterParams(userRow?.openrouter_params),
  );

  const systemParts = [job.systemPrompt.trim(), job.flashcardPrompt.trim()].filter(
    (p) => p.length > 0,
  );
  const system = [
    ...systemParts,
    ...(languageLockEnabled
      ? [
          `language lock: output all flashcard text in ${uiLanguageName(uiLanguage)} only.`,
          "do not use any other language in front/back/options.",
        ]
      : []),
    'output must be valid json only. ensure json begins with {"name":',
  ].join("\n\n");

  const completion = await openRouterChatCompletionStream({
    apiKey,
    model: job.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: job.prompt },
    ],
    params,
  });

  if (!completion.ok) {
    serverLog("warn", "ai deck job: openrouter request failed", {
      jobId: job.id,
      userId: job.userId,
      status: completion.status,
      error: completion.error,
    });
    if (completion.status === 401) {
      await failJob(job.id, job.userId, "openrouter rejected the api key");
      return;
    }
    if (completion.status === 429) {
      await failJob(job.id, job.userId, "openrouter rate limit reached");
      return;
    }
    await failJob(job.id, job.userId, completion.error);
    return;
  }

  let buffer = "";
  let deckId = "";
  let nameUpdated = false;
  let inserted = 0;
  let scanFrom = 0;
  let lastPublishMs = 0;
  let insertErrors = 0;
  let insertedBasic = 0;
  let insertedMcq = 0;
  let extractedObjects = 0;
  let jsonParseErrors = 0;
  let normalizedRejected = 0;
  let duplicateFronts = 0;
  let invalidMcqShape = 0;
  const sampleInserted: Array<{ kind: string; front: string }> = [];
  const sampleInvalidMcq: Array<{ reason: string; json: string }> = [];
  const seenFronts = new Set<string>();
  let totalChars = 0;
  let outputPreviewStart = "";
  let outputPreviewEnd = "";
  const maxPreviewStart = 4000;
  const maxPreviewEnd = 2000;

  const publishDecksChanged = (force?: boolean) => {
    const now = Date.now();
    if (!force && now - lastPublishMs < 600) {
      return;
    }
    lastPublishMs = now;
    publishUserEvent(job.userId, { type: "decks_changed" });
  };

  const baseName = fallbackDeckName(job.prompt);
  const baseParsed = deckNameSchema.safeParse(baseName);
  const created = await createDeck(job.userId, baseParsed.success ? baseParsed.data : "ai deck");
  deckId = created.id;
  if (!deckId || deckId === "undefined" || deckId === "null") {
    await failJob(job.id, job.userId, "could not create deck");
    return;
  }
  await attachDeckToJob(job.id, job.userId, deckId);
  serverLog("info", "ai deck job: deck created", {
    jobId: job.id,
    userId: job.userId,
    deckId,
    deckName: created.name,
  });
  publishDecksChanged(true);

  try {
    for await (const chunk of completion.stream) {
      buffer += chunk;
      totalChars += chunk.length;
      if (outputPreviewStart.length < maxPreviewStart) {
        outputPreviewStart += chunk.slice(0, Math.max(0, maxPreviewStart - outputPreviewStart.length));
      }
      outputPreviewEnd = (outputPreviewEnd + chunk).slice(
        Math.max(0, outputPreviewEnd.length + chunk.length - maxPreviewEnd),
      );

      if (!nameUpdated) {
        const rawName = tryExtractJsonStringValue(buffer, "name");
        if (rawName) {
          nameUpdated = true;
          const candidate = rawName.trim();
          const nameParsed = deckNameSchema.safeParse(candidate);
          if (nameParsed.success && deckId) {
            const updatedName = await renameDeck(job.userId, deckId, nameParsed.data);
            serverLog("info", "ai deck job: deck renamed", {
              jobId: job.id,
              userId: job.userId,
              deckId,
              deckName: updatedName,
            });
            publishDecksChanged(true);
          }
        }
      }

      while (true) {
        const frontIdx = buffer.indexOf("\"front\"", scanFrom);
        if (frontIdx < 0) {
          break;
        }

        const objectStart = buffer.lastIndexOf("{", frontIdx);
        if (objectStart < 0) {
          scanFrom = frontIdx + 7;
          continue;
        }

        const extracted = extractJsonObjectAt(buffer, objectStart);
        if (!extracted) {
          break;
        }

        scanFrom = extracted.endIndex + 1;
        extractedObjects += 1;
        const parsed = parseJsonLenient(extracted.json);
        if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
          jsonParseErrors += 1;
          continue;
        }

        const anyValue = parsed.value as any;
        const hasMcqShape =
          anyValue?.mcq !== undefined ||
          anyValue?.choices !== undefined ||
          anyValue?.options !== undefined ||
          anyValue?.mcqOptions !== undefined ||
          anyValue?.mcq_options !== undefined ||
          anyValue?.mcqCorrectIndex !== undefined ||
          anyValue?.mcq_correct_index !== undefined ||
          anyValue?.correctIndex !== undefined ||
          anyValue?.answerIndex !== undefined ||
          anyValue?.correct_index !== undefined ||
          anyValue?.correctAnswerIndex !== undefined;

        const card = normalizeAiFlashcard(parsed.value);
        if (!card) {
          normalizedRejected += 1;
          if (hasMcqShape && sampleInvalidMcq.length < 3) {
            sampleInvalidMcq.push({
              reason: "invalid flashcard shape",
              json: extracted.json.slice(0, 2000),
            });
          }
          continue;
        }

        if (hasMcqShape && !card.mcqOptions) {
          invalidMcqShape += 1;
          if (sampleInvalidMcq.length < 3) {
            sampleInvalidMcq.push({
              reason: "mcq fields present but normalization failed",
              json: extracted.json.slice(0, 2000),
            });
          }
        }

        const frontKey = card.front.trim().toLowerCase();
        if (!frontKey || seenFronts.has(frontKey)) {
          duplicateFronts += 1;
          continue;
        }
        seenFronts.add(frontKey);

        try {
          const insertRes = await pool.query(
            `
              insert into flashcards
                (deck_id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height)
              values
                ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
              on conflict do nothing
            `,
            [
              deckId,
              card.kind,
              card.front,
              card.back,
              card.mcqOptions ? JSON.stringify(card.mcqOptions) : null,
              card.mcqCorrectIndex,
              card.p5Code,
              card.p5Width,
              card.p5Height,
            ],
          );
          const rowCount = insertRes.rowCount ?? 0;
          if (rowCount > 0) {
            inserted += 1;
            if (card.kind === "mcq") {
              insertedMcq += 1;
            } else {
              insertedBasic += 1;
            }
            if (sampleInserted.length < 25) {
              sampleInserted.push({ kind: card.kind, front: card.front.slice(0, 200) });
            }
            publishDecksChanged(false);
            if (inserted % 100 === 0) {
              serverLog("info", "ai deck job: inserted flashcards", {
                jobId: job.id,
                userId: job.userId,
                deckId,
                inserted,
              });
            }
          }
        } catch (err) {
          insertErrors += 1;
          if (insertErrors <= 3) {
            serverLog("warn", "ai deck job: flashcard insert failed", {
              jobId: job.id,
              userId: job.userId,
              deckId,
              inserted,
              err,
            });
          }
        }

        if (inserted >= 10_000) {
          break;
        }
      }

      if (scanFrom > 40_000) {
        buffer = buffer.slice(scanFrom);
        scanFrom = 0;
      }
      if (inserted >= 10_000) {
        break;
      }
    }
  } catch (err) {
    serverLog("error", "ai deck job: openrouter stream failed", {
      jobId: job.id,
      userId: job.userId,
      deckId,
      inserted,
      err,
    });
    if (deckId) {
      await deleteDeckIfEmpty(job.userId, deckId);
    }
    const message =
      (err as any)?.name === "AbortError" || String((err as any)?.message ?? "").includes("timed out")
        ? "openrouter stream timed out"
        : "openrouter stream failed";
    await failJob(job.id, job.userId, message);
    return;
  }

  if (inserted === 0) {
    serverLog("warn", "ai deck job: no usable flashcards", {
      jobId: job.id,
      userId: job.userId,
      deckId,
      totalChars,
      extractedObjects,
      jsonParseErrors,
      normalizedRejected,
      duplicateFronts,
      invalidMcqShape,
      outputPreviewStart,
      outputPreviewEnd,
      sampleInvalidMcq,
    });
    await deleteDeckIfEmpty(job.userId, deckId);
    await failJob(job.id, job.userId, "model did not generate any usable flashcards");
    return;
  }

  serverLog("info", "ai deck job: completed", {
    jobId: job.id,
    userId: job.userId,
    deckId,
    inserted,
    insertedBasic,
    insertedMcq,
    totalChars,
    extractedObjects,
    jsonParseErrors,
    normalizedRejected,
    duplicateFronts,
    invalidMcqShape,
    outputPreviewStart,
    outputPreviewEnd,
    sampleInserted,
    sampleInvalidMcq,
  });
  await succeedJob(job.id, job.userId, deckId);
}

async function processJob(job: {
  id: string;
  userId: string;
  deckId: string | null;
  jobType: AiDeckJobType;
  prompt: string;
  model: string;
  systemPrompt: string;
  flashcardPrompt: string;
  attempt: number;
}) {
  if (job.jobType === "add_flashcards") {
    const deckId = job.deckId;
    if (!deckId) {
      await failJob(job.id, job.userId, "missing deck id");
      return;
    }
    await processAddFlashcardsJob({
      id: job.id,
      userId: job.userId,
      deckId,
      prompt: job.prompt,
      model: job.model,
      systemPrompt: job.systemPrompt,
      flashcardPrompt: job.flashcardPrompt,
      attempt: job.attempt,
    });
    return;
  }

  if (job.jobType === "edit_flashcards") {
    const deckId = job.deckId;
    if (!deckId) {
      await failJob(job.id, job.userId, "missing deck id");
      return;
    }
    await processEditFlashcardsJob({
      id: job.id,
      userId: job.userId,
      deckId,
      prompt: job.prompt,
      model: job.model,
      systemPrompt: job.systemPrompt,
      flashcardPrompt: job.flashcardPrompt,
      attempt: job.attempt,
    });
    return;
  }

  await processCreateDeckJob({
    id: job.id,
    userId: job.userId,
    prompt: job.prompt,
    model: job.model,
    systemPrompt: job.systemPrompt,
    flashcardPrompt: job.flashcardPrompt,
    attempt: job.attempt,
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __aiDeckJobRunners: Map<string, Promise<void>> | undefined;
}

async function runJob(jobId: string) {
  await markStuckJobs();

  const loaded = await loadJob(jobId);
  if (!loaded) {
    return;
  }

  if (loaded.status === "succeeded" || loaded.status === "failed") {
    return;
  }

  const job =
    loaded.status === "queued"
      ? await claimJob(jobId)
      : {
          id: loaded.id,
          userId: loaded.userId,
          deckId: loaded.deckId,
          jobType: loaded.jobType,
          prompt: loaded.prompt,
          model: loaded.model,
          systemPrompt: loaded.systemPrompt,
          flashcardPrompt: loaded.flashcardPrompt,
          attempt: loaded.attempt,
        };

  if (!job) {
    const current = await loadJob(jobId);
    if (current && current.status === "queued" && Number(current.attempt ?? 0) >= MAX_JOB_ATTEMPTS) {
      await failJob(jobId, current.userId, "too many attempts");
    }
    return;
  }

  try {
    await processJob(job);
  } catch (err) {
    serverLog("error", "ai deck job: unexpected error", {
      jobId: job.id,
      userId: job.userId,
      err,
    });
    await failJob(job.id, job.userId, "unexpected error");
  }
}

export function startAiDeckJob(jobId: string) {
  if (!global.__aiDeckJobRunners) {
    global.__aiDeckJobRunners = new Map();
  }

  const existing = global.__aiDeckJobRunners.get(jobId);
  if (existing) {
    return;
  }

  const promise = runJob(jobId).finally(() => {
    global.__aiDeckJobRunners?.delete(jobId);
  });

  global.__aiDeckJobRunners.set(jobId, promise);
}

export async function sweepStuckAiDeckJobs() {
  await markStuckJobs();
}
