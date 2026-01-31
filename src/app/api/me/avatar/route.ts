import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const pool = getPool();
  const res = await pool.query(
    `
      select avatar_bytes, avatar_content_type
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );

  const row = res.rows[0] as
    | { avatar_bytes: Buffer | null; avatar_content_type: string | null }
    | undefined;
  if (!row?.avatar_bytes || !row.avatar_content_type) {
    return new NextResponse("not found", { status: 404 });
  }

  const bytes = new Uint8Array(row.avatar_bytes.byteLength);
  bytes.set(row.avatar_bytes);

  return new NextResponse(bytes.buffer, {
    headers: {
      "content-type": row.avatar_content_type,
      "cache-control": "no-store",
    },
  });
}
