import { NextResponse } from "next/server";

import { z } from "zod";

import { getCurrentUser } from "@/server/auth";
import { sweepStuckAiDeckJobs } from "@/server/ai-deck-worker";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await sweepStuckAiDeckJobs();

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ limit: url.searchParams.get("limit") });
  const limit = parsed.success ? parsed.data.limit : 50;

  const pool = getPool();
  const settingsRes = await pool.query(
    `
      select ai_deck_job_logs_enabled, ai_deck_job_logs_retention_ms
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );
  const settingsRow = settingsRes.rows[0] as
    | { ai_deck_job_logs_enabled?: boolean; ai_deck_job_logs_retention_ms?: number }
    | undefined;
  const logsEnabled = settingsRow?.ai_deck_job_logs_enabled !== false;
  const retentionMsRaw = Number(settingsRow?.ai_deck_job_logs_retention_ms ?? 604800000);
  const retentionMs = Number.isFinite(retentionMsRaw) ? Math.max(0, retentionMsRaw) : 604800000;

  if (!logsEnabled || retentionMs <= 0) {
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
      [user.id, retentionMs],
    );
  }

  const res = await pool.query(
    `
      select
        j.id,
        j.status,
        j.deck_id,
        d.name as deck_name,
        j.prompt,
        j.model,
        j.system_prompt,
        j.flashcard_prompt,
        j.error,
        j.started_at,
        j.created_at,
        j.updated_at
      from ai_deck_jobs j
      left join decks d on d.id = j.deck_id
      where j.user_id = $1
      order by j.created_at desc
      limit $2
    `,
    [user.id, limit],
  );

  return NextResponse.json({
    ok: true,
    jobs: (res.rows as any[]).map((r) => ({
      id: String(r.id),
      status:
        r.status === "queued" || r.status === "running" || r.status === "succeeded" || r.status === "failed"
          ? String(r.status)
          : "failed",
      deckId: r.deck_id ? String(r.deck_id) : null,
      deckName: r.deck_name ? String(r.deck_name) : null,
      prompt: String(r.prompt ?? ""),
      model: String(r.model ?? ""),
      systemPrompt: String(r.system_prompt ?? ""),
      flashcardPrompt: String(r.flashcard_prompt ?? ""),
      error: r.error ? String(r.error) : null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = getPool();
  await pool.query("delete from ai_deck_jobs where user_id = $1", [user.id]);
  publishUserEvent(user.id, { type: "ai_deck_job_changed", jobId: "" });

  return NextResponse.json({ ok: true });
}
