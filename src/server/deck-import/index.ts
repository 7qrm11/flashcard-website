import "server-only";

import { normalizeAiFlashcard, type NormalizedAiFlashcard } from "@/server/ai-flashcards";
import { getPool } from "@/server/db";

type ImportedFlashcard = {
  front: string;
  back: string;
  kind?: string;
  mcq?: { options: string[]; correctIndex: number };
  p5?: { width?: number | null; height?: number | null; code: string };
};
export type ImportedDeck = { name: string; flashcards: ImportedFlashcard[] };

export async function findAvailableDeckNameForUser(
  userId: string,
  baseName: string,
  label: "import" | "ai" = "import",
  excludeDeckId?: string | null,
) {
  const pool = getPool();
  const trimmed = baseName.trim() || `${label} deck`;
  const exclude = excludeDeckId && excludeDeckId.trim().length > 0 ? excludeDeckId.trim() : null;
  const res = await pool.query(
    "select lower(name) as name from decks where user_id = $1 and ($2::uuid is null or id <> $2::uuid)",
    [userId, exclude],
  );
  const taken = new Set<string>();
  for (const row of res.rows as any[]) {
    taken.add(String(row.name));
  }

  const baseLower = trimmed.toLowerCase();
  if (!taken.has(baseLower)) {
    return trimmed;
  }

  const suffixBase = `${trimmed} (${label})`;
  if (!taken.has(suffixBase.toLowerCase())) {
    return suffixBase;
  }

  for (let i = 2; i <= 2000; i += 1) {
    const candidate = `${trimmed} (${label} ${i})`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${trimmed} (${label} ${Date.now()})`;
}

export async function importDeckForUser(userId: string, deck: ImportedDeck) {
  const name = await findAvailableDeckNameForUser(userId, deck.name);
  const cards = deck.flashcards
    .map((c) => normalizeAiFlashcard(c))
    .filter((c): c is NormalizedAiFlashcard => c !== null);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");

    const deckRes = await client.query(
      "insert into decks (user_id, name, is_default, is_archived) values ($1, $2, false, false) returning id",
      [userId, name],
    );
    const deckId = String(deckRes.rows[0]?.id);

    if (cards.length > 0) {
      const kinds = cards.map((c) => c.kind);
      const fronts = cards.map((c) => c.front);
      const backs = cards.map((c) => c.back);
      const mcqOptions = cards.map((c) => (c.mcqOptions ? JSON.stringify(c.mcqOptions) : null));
      const mcqCorrectIndices = cards.map((c) => c.mcqCorrectIndex);
      const p5Codes = cards.map((c) => c.p5Code);
      const p5Widths = cards.map((c) => c.p5Width);
      const p5Heights = cards.map((c) => c.p5Height);
      await client.query(
        `
          insert into flashcards
            (deck_id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height)
          select
            $1, t.kind, t.front, t.back, t.mcq_options, t.mcq_correct_index, t.p5_code, t.p5_width, t.p5_height
          from unnest(
            $2::text[],
            $3::text[],
            $4::text[],
            $5::jsonb[],
            $6::int[],
            $7::text[],
            $8::int[],
            $9::int[]
          ) as t(kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height)
          on conflict do nothing
        `,
        [
          deckId,
          kinds,
          fronts,
          backs,
          mcqOptions,
          mcqCorrectIndices,
          p5Codes,
          p5Widths,
          p5Heights,
        ],
      );
    }

    await client.query("commit");
    return { ok: true as const, deckId };
  } catch (err: any) {
    try {
      await client.query("rollback");
    } catch {}
    return { ok: false as const, error: "import failed" };
  } finally {
    client.release();
  }
}
