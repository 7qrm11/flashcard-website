import { NextResponse } from "next/server";

import { clearSessionCookie, getSessionToken } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";

export const runtime = "nodejs";

export async function POST() {
  const token = getSessionToken();
  if (token) {
    const pool = getPool();
    const deleted = await pool.query("delete from sessions where token = $1 returning user_id", [
      token,
    ]);
    const userId = deleted.rows[0]?.user_id ? String(deleted.rows[0].user_id) : null;
    if (userId) {
      publishUserEvent(userId, { type: "auth_changed" });
    }
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
