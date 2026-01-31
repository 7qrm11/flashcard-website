import { NextResponse } from "next/server";

import { getPool } from "@/server/db";
import { usernameSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: { username: string } }>,
) {
  const parsed = usernameSchema.safeParse(params.username);
  if (!parsed.success) {
    return new NextResponse("not found", { status: 404 });
  }

  const pool = getPool();
  const res = await pool.query(
    `
      select avatar_bytes, avatar_content_type
      from users
      where username = $1
      limit 1
    `,
    [parsed.data],
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

