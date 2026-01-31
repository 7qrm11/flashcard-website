import { NextResponse } from "next/server";

import { clearSessionCookie, getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishPublicUserEvent, publishUserEvent } from "@/server/events";
import { verifyPassword } from "@/server/password";
import { deleteAccountSchema } from "@/shared/validation";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
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

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const pool = getPool();
  const res = await pool.query(
    "select password_hash from users where id = $1 limit 1",
    [user.id],
  );

  const row = res.rows[0] as { password_hash: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ok = await verifyPassword(row.password_hash, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  await pool.query("delete from users where id = $1", [user.id]);
  publishUserEvent(user.id, { type: "user_deleted" });
  publishPublicUserEvent(user.id, { type: "user_deleted" });

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
