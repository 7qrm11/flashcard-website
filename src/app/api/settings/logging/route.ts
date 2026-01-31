import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { updateLoggingSettingsSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  const parsed = updateLoggingSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const retentionMs = parsed.data.retentionDays * DAY_MS;
  const aiRetentionMs = parsed.data.aiDeckJobLogsRetentionDays * DAY_MS;

  const pool = getPool();
  await pool.query(
    `
      update users
      set
        logging_enabled = $1,
        logging_retention_ms = $2,
        ai_deck_job_logs_enabled = $3,
        ai_deck_job_logs_retention_ms = $4
      where id = $5
    `,
    [
      parsed.data.loggingEnabled,
      retentionMs,
      parsed.data.aiDeckJobLogsEnabled,
      aiRetentionMs,
      user.id,
    ],
  );

  await pool.query(
    `
      delete from user_logs
      where user_id = $1
        and created_at < now() - ($2::text || ' milliseconds')::interval
    `,
    [user.id, retentionMs],
  );

  if (!parsed.data.aiDeckJobLogsEnabled || aiRetentionMs <= 0) {
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
      [user.id, aiRetentionMs],
    );
  }

  publishUserEvent(user.id, { type: "sync" });
  return NextResponse.json({ ok: true });
}
