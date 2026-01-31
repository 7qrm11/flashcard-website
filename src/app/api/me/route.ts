import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pool = getPool();
  const res = await pool.query(
    `
      select username, created_at, last_active_at, avatar_updated_at
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );

  const row = res.rows[0];
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    username: row.username,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    avatarUpdatedAt: row.avatar_updated_at,
  });
}
