import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishPublicUserEvent, publishUserEvent } from "@/server/events";
import { verifyPassword } from "@/server/password";
import { updateUsernameSchema } from "@/shared/validation";

export const runtime = "nodejs";

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

  const parsed = updateUsernameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { newUsername, password } = parsed.data;
  const pool = getPool();
  const res = await pool.query(
    "select username, password_hash from users where id = $1 limit 1",
    [user.id],
  );

  const row = res.rows[0] as { username: string; password_hash: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ok = await verifyPassword(row.password_hash, password);
  if (!ok) {
    return NextResponse.json({ error: "invalid password" }, { status: 401 });
  }

  if (newUsername === row.username) {
    return NextResponse.json({ ok: true, username: row.username });
  }

  try {
    const updated = await pool.query(
      "update users set username = $1 where id = $2 returning username",
      [newUsername, user.id],
    );
    const nextUsername = String(updated.rows[0]?.username ?? newUsername);
    publishUserEvent(user.id, { type: "username_changed", username: nextUsername });
    publishPublicUserEvent(user.id, { type: "username_changed", username: nextUsername });
    return NextResponse.json({ ok: true, username: updated.rows[0]?.username });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "username is taken" }, { status: 409 });
    }
    throw err;
  }
}
