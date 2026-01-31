import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { importDeckForUser } from "@/server/deck-import";
import { publishUserEvent } from "@/server/events";
import { deckNameSchema } from "@/shared/validation";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DECK_IMPORT_BYTES = 10 * 1024 * 1024;

const importFlashcardTextSchema = z.string().max(4000);
const importFlashcardKindSchema = z.string().max(32).optional();

const importFlashcardMcqSchema = z
  .object({
    options: z.array(importFlashcardTextSchema).min(2).max(8),
    correctIndex: z.number().int().min(0).max(7),
  })
  .optional();

const importFlashcardP5Schema = z
  .object({
    width: z.number().int().min(100).max(1200).nullable().optional(),
    height: z.number().int().min(100).max(900).nullable().optional(),
    code: z.string().max(40_000),
  })
  .optional();

const importedDeckSchema = z.object({
  name: deckNameSchema,
  flashcards: z
    .array(
      z.object({
        front: importFlashcardTextSchema,
        back: importFlashcardTextSchema,
        kind: importFlashcardKindSchema,
        mcq: importFlashcardMcqSchema,
        p5: importFlashcardP5Schema,
      }),
    )
    .max(10000),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const file = form.get("deck");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing deck file" }, { status: 400 });
  }

  if (file.size > MAX_DECK_IMPORT_BYTES) {
    return NextResponse.json({ error: "Deck file is too large" }, { status: 413 });
  }

  let raw: string;
  try {
    raw = await file.text();
  } catch {
    return NextResponse.json({ error: "invalid file" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = importedDeckSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid deck export" }, { status: 400 });
  }

  const imported = await importDeckForUser(user.id, parsed.data);
  if (!imported.ok) {
    return NextResponse.json({ error: imported.error }, { status: 500 });
  }

  publishUserEvent(user.id, { type: "decks_changed" });
  return NextResponse.json({ ok: true, id: imported.deckId });
}
