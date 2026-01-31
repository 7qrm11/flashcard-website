import "server-only";

import type { PoolClient } from "pg";

type ReviewAttempt = Readonly<{ correct: boolean; timeMs: number; answeredAt: Date }>;

type SchedulerSettings = Readonly<{
  baseIntervalMs: number;
  rewardMultiplier: number;
  penaltyMultiplier: number;
  requiredTimeMs: number;
  timeHistoryLimit: number;
}>;

const defaultSettings: SchedulerSettings = {
  baseIntervalMs: 30 * 60 * 1000,
  rewardMultiplier: 1.8,
  penaltyMultiplier: 0.6,
  requiredTimeMs: 10000,
  timeHistoryLimit: 10,
};

const minIntervalMs = 1000;
const maxIntervalMs = 10 * 365 * 24 * 60 * 60 * 1000;

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clampFloat(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

async function getSchedulerSettings(client: PoolClient, userId: string): Promise<SchedulerSettings> {
  const res = await client.query(
    `
      select
        scheduler_base_interval_ms,
        scheduler_reward_multiplier,
        scheduler_penalty_multiplier,
        scheduler_required_time_ms,
        scheduler_time_history_limit
      from users
      where id = $1
      limit 1
    `,
    [userId],
  );
  const row = res.rows[0] as
    | {
        scheduler_base_interval_ms: number;
        scheduler_reward_multiplier: number;
        scheduler_penalty_multiplier: number;
        scheduler_required_time_ms: number;
        scheduler_time_history_limit: number;
      }
    | undefined;

  return {
    baseIntervalMs: clampInt(Number(row?.scheduler_base_interval_ms ?? defaultSettings.baseIntervalMs), 1000, maxIntervalMs),
    rewardMultiplier: clampFloat(Number(row?.scheduler_reward_multiplier ?? defaultSettings.rewardMultiplier), 0.0001, 1000),
    penaltyMultiplier: clampFloat(Number(row?.scheduler_penalty_multiplier ?? defaultSettings.penaltyMultiplier), 0.0001, 1000),
    requiredTimeMs: clampInt(Number(row?.scheduler_required_time_ms ?? defaultSettings.requiredTimeMs), 0, 3600000),
    timeHistoryLimit: clampInt(Number(row?.scheduler_time_history_limit ?? defaultSettings.timeHistoryLimit), 1, 1000),
  };
}

function isWithinRequiredTime(timeMs: number, requiredTimeMs: number) {
  if (!Number.isFinite(requiredTimeMs) || requiredTimeMs <= 0) {
    return true;
  }
  return timeMs <= requiredTimeMs;
}

function computeNextIntervalMs(prevIntervalMs: number, multiplier: number) {
  const raw = Math.round(prevIntervalMs * multiplier);
  return clampInt(raw, minIntervalMs, maxIntervalMs);
}

type ReviewHistoryEntry = Readonly<{ correct: boolean; timeMs: number }>;

function normalizeHistory(value: unknown): ReviewHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: ReviewHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const correct = Boolean((item as any).correct);
    const timeMsRaw = Number((item as any).timeMs);
    const timeMs = clampInt(timeMsRaw, 0, 60 * 60 * 1000);
    out.push({ correct, timeMs });
  }
  return out;
}

function appendHistory(
  prev: ReviewHistoryEntry[],
  entry: ReviewHistoryEntry,
  limit: number,
): ReviewHistoryEntry[] {
  const next = [...prev, entry];
  if (next.length <= limit) {
    return next;
  }
  return next.slice(Math.max(0, next.length - limit));
}

export async function recordFlashcardReview(
  client: PoolClient,
  userId: string,
  flashcardId: string,
  attempt: ReviewAttempt,
) {
  const timeMs = clampInt(Number(attempt.timeMs), 0, 60 * 60 * 1000);
  const correct = Boolean(attempt.correct);
  const answeredAt = attempt.answeredAt instanceof Date ? attempt.answeredAt : new Date(attempt.answeredAt);

  const settings = await getSchedulerSettings(client, userId);
  const withinTime = isWithinRequiredTime(timeMs, settings.requiredTimeMs);
  const multiplier = correct && withinTime ? settings.rewardMultiplier : settings.penaltyMultiplier;

  const scheduleRes = await client.query(
    `
      select interval_ms, review_history, last_seen_at
      from flashcard_schedules
      where user_id = $1
        and flashcard_id = $2
      limit 1
      for update
    `,
    [userId, flashcardId],
  );

  const row = scheduleRes.rows[0] as
    | { interval_ms: number; review_history: unknown; last_seen_at: string | null }
    | undefined;

  const prevIntervalMs = clampInt(
    Number(row?.interval_ms ?? settings.baseIntervalMs),
    minIntervalMs,
    maxIntervalMs,
  );
  const nextIntervalMs = computeNextIntervalMs(prevIntervalMs, multiplier);
  const nextDueAt = new Date(answeredAt.getTime() + nextIntervalMs);

  const prevHistory = normalizeHistory(row?.review_history);
  const nextHistory = appendHistory(prevHistory, { correct, timeMs }, settings.timeHistoryLimit);

  const insertPrevIntervalMs = clampInt(settings.baseIntervalMs, minIntervalMs, maxIntervalMs);

  await client.query(
    `
      insert into flashcard_schedules (
        user_id,
        flashcard_id,
        due_at,
        interval_ms,
        prev_interval_ms,
        last_multiplier,
        review_history,
        last_review_time_ms,
        last_review_correct,
        last_seen_at,
        prev_last_seen_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
      on conflict (user_id, flashcard_id)
      do update set
        due_at = excluded.due_at,
        prev_interval_ms = flashcard_schedules.interval_ms,
        interval_ms = excluded.interval_ms,
        last_multiplier = excluded.last_multiplier,
        review_history = excluded.review_history,
        last_review_time_ms = excluded.last_review_time_ms,
        last_review_correct = excluded.last_review_correct,
        prev_last_seen_at = flashcard_schedules.last_seen_at,
        last_seen_at = excluded.last_seen_at
    `,
    [
      userId,
      flashcardId,
      nextDueAt,
      nextIntervalMs,
      row ? prevIntervalMs : insertPrevIntervalMs,
      multiplier,
      JSON.stringify(nextHistory),
      timeMs,
      correct,
      answeredAt,
      answeredAt,
    ],
  );
}

export async function applyFlashcardReviewCorrection(
  client: PoolClient,
  userId: string,
  flashcardId: string,
  correction: Readonly<{ correct: boolean; timeMs: number; answeredAt: Date }>,
) {
  const timeMs = clampInt(Number(correction.timeMs), 0, 60 * 60 * 1000);
  const correct = Boolean(correction.correct);
  const answeredAt =
    correction.answeredAt instanceof Date ? correction.answeredAt : new Date(correction.answeredAt);

  const settings = await getSchedulerSettings(client, userId);
  const withinTime = isWithinRequiredTime(timeMs, settings.requiredTimeMs);

  const scheduleRes = await client.query(
    `
      select prev_interval_ms, review_history
      from flashcard_schedules
      where user_id = $1
        and flashcard_id = $2
      limit 1
      for update
    `,
    [userId, flashcardId],
  );

  const row = scheduleRes.rows[0] as
    | { prev_interval_ms: number; review_history: unknown }
    | undefined;
  if (!row) {
    return;
  }

  const history = normalizeHistory(row.review_history);
  const previousCorrect = history.length > 0 ? Boolean(history[history.length - 1]?.correct) : null;
  const correctionToCorrect = previousCorrect === false && correct === true;
  const multiplier = correctionToCorrect
    ? 1
    : correct && withinTime
      ? settings.rewardMultiplier
      : settings.penaltyMultiplier;

  const basePrevIntervalMs = clampInt(
    Number(row.prev_interval_ms ?? settings.baseIntervalMs),
    minIntervalMs,
    maxIntervalMs,
  );
  const correctedIntervalMs = computeNextIntervalMs(basePrevIntervalMs, multiplier);
  const correctedDueAt = new Date(answeredAt.getTime() + correctedIntervalMs);

  const nextHistory = (() => {
    if (history.length === 0) {
      return [{ correct, timeMs }];
    }
    const updated = history.slice();
    updated[updated.length - 1] = { correct, timeMs };
    return updated;
  })();

  await client.query(
    `
      update flashcard_schedules
      set
        due_at = $1,
        interval_ms = $2,
        last_multiplier = $3,
        review_history = $4::jsonb,
        last_review_time_ms = $5,
        last_review_correct = $6,
        last_seen_at = $7
      where user_id = $8
        and flashcard_id = $9
    `,
    [
      correctedDueAt,
      correctedIntervalMs,
      multiplier,
      JSON.stringify(nextHistory),
      timeMs,
      correct,
      answeredAt,
      userId,
      flashcardId,
    ],
  );
}
