import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findCopyName(pool: ReturnType<typeof getPool>, userId: string, baseName: string) {
  const res = await pool.query("select lower(name) as name from decks where user_id = $1", [userId]);
  const taken = new Set<string>();
  for (const row of res.rows as any[]) {
    taken.add(String(row.name));
  }

  const trimmed = baseName.trim();
  const candidate1 = `${trimmed} (copy)`;
  if (!taken.has(candidate1.toLowerCase())) {
    return candidate1;
  }

  for (let i = 2; i <= 2000; i += 1) {
    const candidate = `${trimmed} (copy ${i})`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${trimmed} (copy ${Date.now()})`;
}

export async function POST(
  _request: Request,
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

  const pool = getPool();
  const deckRes = await pool.query(
    "select id, name, is_default from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );
  const deck = deckRes.rows[0] as { id: string; name: string; is_default: boolean } | undefined;
  if (!deck) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const name = await findCopyName(pool, user.id, String(deck.name));

  const client = await pool.connect();
  try {
    await client.query("begin");

    const newDeckRes = await client.query(
      "insert into decks (user_id, name, is_default, is_archived) values ($1, $2, false, false) returning id",
      [user.id, name],
    );
    const newDeckId = String(newDeckRes.rows[0]?.id);

    await client.query(
      `
        insert into flashcards
          (deck_id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height)
        select
          $1, f.kind, f.front, f.back, f.mcq_options, f.mcq_correct_index, f.p5_code, f.p5_width, f.p5_height
        from flashcards f
        where f.deck_id = $2
          and char_length(trim(f.front)) > 0
          and char_length(trim(f.back)) > 0
        order by f.created_at asc
      `,
      [newDeckId, deckIdParsed.data],
    );

    await client.query("commit");
    publishUserEvent(user.id, { type: "decks_changed" });
    return NextResponse.json({ ok: true, id: newDeckId });
  } catch {
    try {
      await client.query("rollback");
    } catch {}
    return NextResponse.json({ error: "duplicate failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
