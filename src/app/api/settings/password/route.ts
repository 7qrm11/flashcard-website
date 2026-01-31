import { NextResponse } from "next/server";

import { getCurrentUser, getSessionToken } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { hashPassword, verifyPassword } from "@/server/password";
import { updatePasswordSchema } from "@/shared/validation";

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

  const parsed = updatePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const { oldPassword, newPassword, newPasswordConfirm } = parsed.data;
  if (newPassword !== newPasswordConfirm) {
    return NextResponse.json(
      { error: "passwords do not match" },
      { status: 400 },
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const res = await client.query(
      "select password_hash from users where id = $1 limit 1",
      [user.id],
    );

    const row = res.rows[0] as { password_hash: string } | undefined;
    if (!row) {
      try {
        await client.query("rollback");
      } catch {}
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const ok = await verifyPassword(row.password_hash, oldPassword);
    if (!ok) {
      try {
        await client.query("rollback");
      } catch {}
      return NextResponse.json({ error: "invalid password" }, { status: 401 });
    }

    const newHash = await hashPassword(newPassword);
    await client.query("update users set password_hash = $1 where id = $2", [
      newHash,
      user.id,
    ]);

    const currentToken = getSessionToken();
    if (currentToken) {
      await client.query(
        "delete from sessions where user_id = $1 and token <> $2",
        [user.id, currentToken],
      );
    } else {
      await client.query("delete from sessions where user_id = $1", [user.id]);
    }

    await client.query("commit");
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {}
    throw err;
  } finally {
    client.release();
  }

  publishUserEvent(user.id, { type: "auth_changed" });
  return NextResponse.json({ ok: true });
}
