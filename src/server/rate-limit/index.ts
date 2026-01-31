import "server-only";

import crypto from "node:crypto";

import type { Pool } from "pg";

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    return ip && ip.length > 0 ? ip : null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    const ip = realIp.trim();
    return ip.length > 0 ? ip : null;
  }

  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    const ip = cfIp.trim();
    return ip.length > 0 ? ip : null;
  }

  return null;
}

export function makeRateLimitBucket(prefix: string, value: string) {
  return `${prefix}:${sha256Hex(value)}`;
}

export async function checkRateLimit(
  pool: Pool,
  bucket: string,
  opts: Readonly<{ windowMs: number; max: number }>,
) {
  const windowStart = new Date(Date.now() - opts.windowMs);
  const res = await pool.query(
    `
      with pruned as (
        delete from rate_limit_events
        where bucket = $1
          and created_at < $2
      ),
      recent as (
        select count(*)::int as count
        from rate_limit_events
        where bucket = $1
          and created_at >= $2
      ),
      ins as (
        insert into rate_limit_events (bucket)
        select $1
        where (select count from recent) < $3
        returning 1
      )
      select
        (select count from recent) as count,
        (select count(*)::int from ins) as inserted
    `,
    [bucket, windowStart, opts.max],
  );

  const inserted = Number(res.rows[0]?.inserted ?? 0);
  return inserted > 0;
}
