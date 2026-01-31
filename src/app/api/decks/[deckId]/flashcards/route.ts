import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { createFlashcardSchema, uuidSchema } from "@/shared/validation";

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
    "select 1 from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );
  if ((deckRes.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const res = await pool.query(
    `
      select id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height, created_at
      from flashcards
      where deck_id = $1
        and char_length(trim(front)) > 0
        and char_length(trim(back)) > 0
      order by created_at desc
    `,
    [deckIdParsed.data],
  );

  return NextResponse.json({
    ok: true,
    flashcards: res.rows.map((r) => ({
      id: String(r.id),
      kind:
        r.kind === "mcq" ? "mcq" : "basic",
      front: String(r.front),
      back: String(r.back),
      mcqOptions: Array.isArray((r as any).mcq_options)
        ? ((r as any).mcq_options as unknown[]).map((v) => String(v))
        : null,
      mcqCorrectIndex:
        (r as any).mcq_correct_index === null || (r as any).mcq_correct_index === undefined
          ? null
          : Number((r as any).mcq_correct_index),
      p5Code: r.p5_code ? String(r.p5_code) : null,
      p5Width: r.p5_width === null || r.p5_width === undefined ? null : Number(r.p5_width),
      p5Height: r.p5_height === null || r.p5_height === undefined ? null : Number(r.p5_height),
      createdAt: String(r.created_at),
    })),
  });
}

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

  const parsed = createFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const kindRaw = parsed.data.kind ?? "basic";
  const kind = kindRaw === "mcq" ? "mcq" : "basic";

  const mcq = parsed.data.mcq ?? undefined;
  if (kind !== "mcq" && mcq) {
    return NextResponse.json({ error: "mcq is only allowed for mcq flashcards" }, { status: 400 });
  }

  let mcqOptions: string[] | null = null;
  let mcqCorrectIndex: number | null = null;
  if (kind === "mcq") {
    if (!mcq) {
      return NextResponse.json({ error: "mcq options are required" }, { status: 400 });
    }
    const options = mcq.options.map((o) => o.trim());
    if (options.length < 2 || options.length > 8) {
      return NextResponse.json({ error: "mcq options must be 2-8 items" }, { status: 400 });
    }
    if (options.some((o) => o.length === 0)) {
      return NextResponse.json({ error: "mcq options cannot be empty" }, { status: 400 });
    }
    const correctIndex = Number(mcq.correctIndex);
    if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return NextResponse.json({ error: "mcq correct index out of range" }, { status: 400 });
    }
    mcqOptions = options;
    mcqCorrectIndex = correctIndex;
  }

  const front = parsed.data.front.trim();
  const back = parsed.data.back.trim();
  if (front.length === 0 || back.length === 0) {
    return NextResponse.json({ error: "front and back are required" }, { status: 400 });
  }

  const p5Input = parsed.data.p5 ?? undefined;
  const p5Code = p5Input?.code ? p5Input.code.trim() : "";
  const p5 = p5Code.length > 0;
  const p5WidthRaw = p5Input?.width ?? null;
  const p5HeightRaw = p5Input?.height ?? null;
  const p5Width = p5 && p5WidthRaw !== null && p5HeightRaw !== null ? Math.floor(Number(p5WidthRaw)) : null;
  const p5Height = p5 && p5WidthRaw !== null && p5HeightRaw !== null ? Math.floor(Number(p5HeightRaw)) : null;

  const pool = getPool();
  const deckRes = await pool.query(
    "select is_archived from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );

  const deck = deckRes.rows[0] as { is_archived: boolean } | undefined;
  if (!deck) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (deck.is_archived) {
    return NextResponse.json({ error: "deck is archived" }, { status: 409 });
  }

  try {
    const res = await pool.query(
      `
        insert into flashcards (deck_id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height)
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
        returning id
      `,
      [
        deckIdParsed.data,
        kind,
        front,
        back,
        mcqOptions ? JSON.stringify(mcqOptions) : null,
        mcqCorrectIndex,
        p5 ? p5Code : null,
        p5Width,
        p5Height,
      ],
    );

    publishUserEvent(user.id, { type: "decks_changed" });
    return NextResponse.json({ ok: true, id: String(res.rows[0]?.id) });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "duplicate flashcard" }, { status: 409 });
    }
    return NextResponse.json({ error: "could not create flashcard" }, { status: 500 });
  }
}
