import { NextResponse } from "next/server";

import { createSessionWithClient, setSessionCookie } from "@/server/auth";
import { getPool } from "@/server/db";
import { hashPassword } from "@/server/password";
import { checkRateLimit, getRequestIp, makeRateLimitBucket } from "@/server/rate-limit";
import { registerSchema } from "@/shared/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { username, password, passwordConfirm } = parsed.data;
  if (password !== passwordConfirm) {
    return NextResponse.json({ error: "passwords do not match" }, { status: 400 });
  }

  const pool = getPool();

  const ip = getRequestIp(request) ?? "unknown";
  const ipOk = await checkRateLimit(pool, makeRateLimitBucket("auth:register:ip", ip), {
    windowMs: 60 * 60 * 1000,
    max: 10,
  });
  if (!ipOk) {
    return NextResponse.json(
      { error: "too many signups, try again later" },
      { status: 429 },
    );
  }

  const existing = await pool.query("select 1 from users where username = $1", [
    username,
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    return NextResponse.json({ error: "username is taken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const client = await pool.connect();
  try {
    await client.query("begin");

    let userId: string;
    try {
      const inserted = await client.query<{ id: string }>(
        "insert into users (username, password_hash) values ($1, $2) returning id",
        [username, passwordHash],
      );
      userId = String(inserted.rows[0]?.id ?? "");
    } catch (err: any) {
      if (err?.code === "23505") {
        try {
          await client.query("rollback");
        } catch {}
        return NextResponse.json({ error: "username is taken" }, { status: 409 });
      }
      throw err;
    }

    await client.query(
      "insert into decks (user_id, name, is_default) values ($1, 'default', true)",
      [userId],
    );

    const session = await createSessionWithClient(client, userId);
    await client.query("commit");

    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, session.token, session.expiresAt);
    return res;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}
