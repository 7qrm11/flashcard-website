import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishUserEvent } from "@/server/events";
import { updateFlashcardSchema, uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: Readonly<{ params: { flashcardId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const flashcardIdParsed = uuidSchema.safeParse(params.flashcardId);
  if (!flashcardIdParsed.success) {
    return NextResponse.json({ error: "Invalid flashcard id" }, { status: 400 });
  }

  const pool = getPool();
  const res = await pool.query(
    `
      delete from flashcards f
      using decks d
      where f.id = $1
        and f.deck_id = d.id
        and d.user_id = $2
        and d.is_archived = false
      returning f.id
    `,
    [flashcardIdParsed.data, user.id],
  );

  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  publishUserEvent(user.id, { type: "decks_changed" });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: Readonly<{ params: { flashcardId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const flashcardIdParsed = uuidSchema.safeParse(params.flashcardId);
  if (!flashcardIdParsed.success) {
    return NextResponse.json({ error: "Invalid flashcard id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = updateFlashcardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const front =
    parsed.data.front === undefined ? undefined : parsed.data.front.trim();
  const back = parsed.data.back === undefined ? undefined : parsed.data.back.trim();
  if (front !== undefined && front.length === 0) {
    return NextResponse.json({ error: "front and back are required" }, { status: 400 });
  }
  if (back !== undefined && back.length === 0) {
    return NextResponse.json({ error: "front and back are required" }, { status: 400 });
  }
  if (
    front === undefined &&
    back === undefined &&
    parsed.data.kind === undefined &&
    parsed.data.mcq === undefined &&
    parsed.data.p5 === undefined
  ) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  let kind: "basic" | "mcq" | null = parsed.data.kind ?? null;
  if (!kind && parsed.data.mcq === null) {
    kind = "basic";
  }
  if (!kind && parsed.data.mcq) {
    kind = "mcq";
  }

  let mcqOptions: string[] | null = null;
  let mcqCorrectIndex: number | null = null;
  let updateMcq = false;
  if (kind) {
    if (kind === "mcq") {
      const mcq = parsed.data.mcq;
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
      updateMcq = true;
    } else {
      mcqOptions = null;
      mcqCorrectIndex = null;
      updateMcq = true;
    }
  }

  let p5Code: string | null = null;
  let p5Width: number | null = null;
  let p5Height: number | null = null;
  const updateP5 = parsed.data.p5 !== undefined;
  if (parsed.data.p5 !== undefined) {
    const p5Raw = parsed.data.p5;
    if (p5Raw === null) {
      p5Code = null;
      p5Width = null;
      p5Height = null;
    } else {
      const code = p5Raw.code.trim();
      if (code.length === 0) {
        p5Code = null;
        p5Width = null;
        p5Height = null;
      } else {
        p5Code = code;
        const widthRaw = p5Raw.width ?? null;
        const heightRaw = p5Raw.height ?? null;
        if (widthRaw === null || heightRaw === null) {
          p5Width = null;
          p5Height = null;
        } else {
          p5Width = Math.floor(Number(widthRaw));
          p5Height = Math.floor(Number(heightRaw));
        }
      }
    }
  }

  const pool = getPool();
  let res;
  try {
    res = await pool.query(
      `
        update flashcards f
        set
          front = coalesce($1, f.front),
          back = coalesce($2, f.back),
          kind = coalesce($3, f.kind),
          mcq_options = case when $4 then $5::jsonb else f.mcq_options end,
          mcq_correct_index = case when $4 then $6 else f.mcq_correct_index end,
          p5_code = case when $7 then $8 else f.p5_code end,
          p5_width = case when $7 then $9 else f.p5_width end,
          p5_height = case when $7 then $10 else f.p5_height end
        from decks d
        where f.id = $11
          and f.deck_id = d.id
          and d.user_id = $12
          and d.is_archived = false
        returning f.id
      `,
      [
        front ?? null,
        back ?? null,
        kind ?? null,
        updateMcq,
        mcqOptions ? JSON.stringify(mcqOptions) : null,
        mcqCorrectIndex,
        updateP5,
        p5Code,
        p5Width,
        p5Height,
        flashcardIdParsed.data,
        user.id,
      ],
    );
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "duplicate flashcard" }, { status: 409 });
    }
    return NextResponse.json({ error: "could not update flashcard" }, { status: 500 });
  }

  if ((res.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  publishUserEvent(user.id, { type: "decks_changed" });
  return NextResponse.json({ ok: true });
}
