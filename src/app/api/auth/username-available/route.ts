import { NextResponse } from "next/server";

import { getPool } from "@/server/db";
import { usernameSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get("username") ?? "").trim();

  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return NextResponse.json({ available: false });
  }

  const pool = getPool();
  const existing = await pool.query("select 1 from users where username = $1", [
    parsed.data,
  ]);

  return NextResponse.json({ available: (existing.rowCount ?? 0) === 0 });
}
