import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { setDeckArchivedSchema, uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: Readonly<{ params: { deckId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deckIdParsed = uuidSchema.safeParse(params.deckId);
  if (!deckIdParsed.success) {
    return NextResponse.json({ error: "Invalid deck id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = setDeckArchivedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const pool = getPool();
  const deckRes = await pool.query(
    "select is_default from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );

  const deck = deckRes.rows[0] as { is_default: boolean } | undefined;
  if (!deck) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (deck.is_default) {
    return NextResponse.json({ error: "default deck cannot be archived" }, { status: 403 });
  }

  await pool.query("update decks set is_archived = $1 where id = $2 and user_id = $3", [
    parsed.data.archived,
    deckIdParsed.data,
    user.id,
  ]);

  publishUserEvent(user.id, { type: "decks_changed" });
  return NextResponse.json({ ok: true });
}
