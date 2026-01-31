import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: Readonly<{ params: { jobId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobIdParsed = uuidSchema.safeParse(params.jobId);
  if (!jobIdParsed.success) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const pool = getPool();
  const res = await pool.query(
    `
      delete from ai_deck_jobs
      where id = $1
        and user_id = $2
      returning id
    `,
    [jobIdParsed.data, user.id],
  );

  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  publishUserEvent(user.id, { type: "ai_deck_job_changed", jobId: jobIdParsed.data });
  return NextResponse.json({ ok: true });
}

