import { NextResponse } from "next/server";

import { z } from "zod";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import type { LogLevel } from "@/shared/logging";
import { toJsonSafe } from "@/shared/logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logLevelSchema: z.ZodType<LogLevel> = z.enum(["debug", "info", "warn", "error"]);

const logEntrySchema = z.object({
  ts: z.string().min(1).max(64),
  source: z.literal("client"),
  level: logLevelSchema,
  message: z.string().max(10_000),
  data: z.unknown().optional(),
  meta: z
    .object({
      href: z.string().optional(),
      pathname: z.string().optional(),
      userAgent: z.string().optional(),
      sessionId: z.string().nullable().optional(),
    })
    .optional(),
});

const bodySchema = z.object({
  entries: z.array(logEntrySchema).min(1).max(100),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().optional(),
});

function write(level: LogLevel, line: string) {
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function parseIsoTs(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    return new Date();
  }
  return d;
}

async function loadUserLoggingSettings(userId: string) {
  const pool = getPool();
  const res = await pool.query(
    `
      select logging_enabled, logging_retention_ms
      from users
      where id = $1
      limit 1
    `,
    [userId],
  );
  const row = res.rows[0] as { logging_enabled?: boolean; logging_retention_ms?: number } | undefined;
  const enabled = row?.logging_enabled !== false;
  const retentionMsRaw = Number(row?.logging_retention_ms ?? 604800000);
  const retentionMs = Number.isFinite(retentionMsRaw) ? Math.max(0, retentionMsRaw) : 604800000;
  return { enabled, retentionMs };
}

async function cleanupUserLogs(userId: string, retentionMs: number) {
  const pool = getPool();
  await pool.query(
    `
      delete from user_logs
      where user_id = $1
        and created_at < now() - ($2::text || ' milliseconds')::interval
    `,
    [userId, retentionMs],
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const { enabled, retentionMs } = await loadUserLoggingSettings(user.id);
  if (!enabled || retentionMs <= 0) {
    return NextResponse.json({ ok: true });
  }

  const entries = parsed.data.entries;
  const pool = getPool();

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const ts = parseIsoTs(entry.ts);
    const metaJson = entry.meta ? JSON.stringify(toJsonSafe(entry.meta)) : null;
    const dataJson = entry.data === undefined ? null : JSON.stringify(toJsonSafe(entry.data));

    const base = i * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb, $${base + 7}::jsonb)`,
    );
    values.push(user.id, entry.source, entry.level, entry.message, ts, metaJson, dataJson);

    const line = JSON.stringify(
      toJsonSafe({
        ts: entry.ts,
        source: entry.source,
        level: entry.level,
        message: entry.message,
        userId: user.id,
        meta: entry.meta,
        data: entry.data,
      }),
    );
    write(entry.level, line);
  }

  await pool.query(
    `
      insert into user_logs (user_id, source, level, message, ts, meta, data)
      values ${placeholders.join(", ")}
    `,
    values,
  );

  await cleanupUserLogs(user.id, retentionMs);

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit"),
    before: url.searchParams.get("before") ?? undefined,
  });
  const limit = parsed.success ? parsed.data.limit : 100;
  const before = parsed.success ? parsed.data.before : undefined;

  const { retentionMs } = await loadUserLoggingSettings(user.id);
  await cleanupUserLogs(user.id, retentionMs);

  const pool = getPool();
  if (before) {
    const beforeDate = parseIsoTs(before);
    const res = await pool.query(
      `
        select id, source, level, message, ts, meta, data, created_at
        from user_logs
        where user_id = $1
          and created_at < $2
        order by created_at desc, id desc
        limit $3
      `,
      [user.id, beforeDate, limit],
    );
    return NextResponse.json({
      ok: true,
      logs: (res.rows as any[]).map((r) => ({
        id: String(r.id),
        source: String(r.source),
        level: String(r.level),
        message: String(r.message),
        ts: new Date(r.ts).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
        meta: r.meta ?? null,
        data: r.data ?? null,
      })),
    });
  }

  const res = await pool.query(
    `
      select id, source, level, message, ts, meta, data, created_at
      from user_logs
      where user_id = $1
      order by created_at desc, id desc
      limit $2
    `,
    [user.id, limit],
  );

  return NextResponse.json({
    ok: true,
    logs: (res.rows as any[]).map((r) => ({
      id: String(r.id),
      source: String(r.source),
      level: String(r.level),
      message: String(r.message),
      ts: new Date(r.ts).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      meta: r.meta ?? null,
      data: r.data ?? null,
    })),
  });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = getPool();
  await pool.query("delete from user_logs where user_id = $1", [user.id]);

  return NextResponse.json({ ok: true });
}
