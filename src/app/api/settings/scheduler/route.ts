import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { updateSchedulerSettingsSchema } from "@/shared/validation";

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

  const parsed = updateSchedulerSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const baseIntervalMs = parsed.data.baseIntervalMinutes * 60 * 1000;
  const requiredTimeMs = parsed.data.requiredTimeSeconds * 1000;

  const pool = getPool();
  await pool.query(
    `
      update users
      set
        scheduler_base_interval_ms = $1,
        scheduler_required_time_ms = $2,
        scheduler_reward_multiplier = $3,
        scheduler_penalty_multiplier = $4,
        scheduler_time_history_limit = $5
      where id = $6
    `,
    [
      baseIntervalMs,
      requiredTimeMs,
      parsed.data.rewardMultiplier,
      parsed.data.penaltyMultiplier,
      parsed.data.timeHistoryLimit,
      user.id,
    ],
  );

  publishUserEvent(user.id, { type: "sync" });
  return NextResponse.json({ ok: true });
}
