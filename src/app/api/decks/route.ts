import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { createDeckSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const archived =
    searchParams.get("archived") === "1" || searchParams.get("archived") === "true";

  const pool = getPool();
  const res = await pool.query(
    `
      select id, name, is_default, is_archived, created_at
      from decks
      where user_id = $1
        and is_archived = $2
      order by is_default desc, created_at asc
    `,
    [user.id, archived],
  );

  return NextResponse.json({
    decks: res.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      isDefault: Boolean(r.is_default),
      isArchived: Boolean(r.is_archived),
      createdAt: String(r.created_at),
    })),
  });
}

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

  const parsed = createDeckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const name = parsed.data.name.trim();
  if (name.length < 1 || name.length > 64) {
    return NextResponse.json({ error: "invalid name" }, { status: 400 });
  }

  const pool = getPool();
  try {
    const res = await pool.query(
      "insert into decks (user_id, name) values ($1, $2) returning id",
      [user.id, name],
    );

    publishUserEvent(user.id, { type: "decks_changed" });
    return NextResponse.json({ ok: true, id: String(res.rows[0]?.id) });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "deck name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "could not create deck" }, { status: 500 });
  }
}
