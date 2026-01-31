import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
    "select id, name from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );
  const deck = deckRes.rows[0] as { id: string; name: string } | undefined;
  if (!deck) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const cardsRes = await pool.query(
    `
      select kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height, created_at
      from flashcards
      where deck_id = $1
        and char_length(trim(front)) > 0
        and char_length(trim(back)) > 0
      order by created_at asc
    `,
    [deckIdParsed.data],
  );

  return NextResponse.json({
    ok: true,
    deck: {
      name: String(deck.name),
      flashcards: cardsRes.rows.map((r) => ({
        front: String(r.front),
        back: String(r.back),
        kind:
          r.kind === "mcq" ? "mcq" : "basic",
        mcq:
          Array.isArray(r.mcq_options) &&
          r.mcq_correct_index !== null &&
          r.mcq_correct_index !== undefined &&
          Number(r.mcq_correct_index) >= 0 &&
          Number(r.mcq_correct_index) < (r.mcq_options as unknown[]).length
            ? {
                options: (r.mcq_options as unknown[]).map((v) => String(v)),
                correctIndex: Number(r.mcq_correct_index),
              }
            : undefined,
        p5: r.p5_code
          ? {
              width: r.p5_width === null || r.p5_width === undefined ? null : Number(r.p5_width),
              height: r.p5_height === null || r.p5_height === undefined ? null : Number(r.p5_height),
              code: String(r.p5_code),
            }
          : undefined,
      })),
    },
  });
}
