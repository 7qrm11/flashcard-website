import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { UI_LANGUAGE_COOKIE } from "@/shared/i18n";

export const runtime = "nodejs";

const schema = z.object({
  language: z.enum(["en", "cs"]),
});

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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const pool = getPool();
  await pool.query("update users set ui_language = $1 where id = $2", [
    parsed.data.language,
    user.id,
  ]);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(UI_LANGUAGE_COOKIE, parsed.data.language, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  publishUserEvent(user.id, { type: "sync" });
  return res;
}

