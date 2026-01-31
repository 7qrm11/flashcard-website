import { NextResponse } from "next/server";

import { createSession, setSessionCookie } from "@/server/auth";
import { getPool } from "@/server/db";
import { verifyPassword } from "@/server/password";
import { checkRateLimit, getRequestIp, makeRateLimitBucket } from "@/server/rate-limit";
import { loginSchema } from "@/shared/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const pool = getPool();

  const ip = getRequestIp(request) ?? "unknown";
  const ipOk = await checkRateLimit(pool, makeRateLimitBucket("auth:login:ip", ip), {
    windowMs: 5 * 60 * 1000,
    max: 30,
  });
  const userOk = await checkRateLimit(
    pool,
    makeRateLimitBucket("auth:login:user", username),
    { windowMs: 5 * 60 * 1000, max: 10 },
  );
  if (!ipOk || !userOk) {
    return NextResponse.json(
      { error: "too many login attempts, try again later" },
      { status: 429 },
    );
  }

  const userRes = await pool.query(
    "select id, password_hash from users where username = $1 limit 1",
    [username],
  );

  const user = userRes.rows[0];
  if (!user) {
    return NextResponse.json(
      { error: "invalid username or password" },
      { status: 401 },
    );
  }

  const ok = await verifyPassword(user.password_hash, password);
  if (!ok) {
    return NextResponse.json(
      { error: "invalid username or password" },
      { status: 401 },
    );
  }

  const session = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, session.token, session.expiresAt);
  return res;
}
