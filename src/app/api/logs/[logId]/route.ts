import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: Readonly<{ params: { logId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const logIdParsed = uuidSchema.safeParse(params.logId);
  if (!logIdParsed.success) {
    return NextResponse.json({ error: "invalid log id" }, { status: 400 });
  }

  const pool = getPool();
  const res = await pool.query(
    `
      delete from user_logs
      where id = $1
        and user_id = $2
      returning id
    `,
    [logIdParsed.data, user.id],
  );

  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

