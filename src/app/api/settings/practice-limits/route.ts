import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { updateDailyLimitsSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const parsed = updateDailyLimitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `
      update users
      set daily_novel_limit = $1,
          daily_review_limit = $2
      where id = $3
    `,
    [parsed.data.dailyNovelLimit, parsed.data.dailyReviewLimit, user.id],
  );

  publishUserEvent(user.id, { type: "sync" });
  return NextResponse.json({ ok: true });
}
