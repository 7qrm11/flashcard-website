import { redirect } from "next/navigation";

import DeckView from "@/features/decks/ui/deck-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { normalizeSearchParam, toPgLikePattern } from "@/shared/search";
import { paginationSchema, uuidSchema } from "@/shared/validation";

export default async function DeckPage({
  params,
  searchParams,
}: Readonly<{
  params: { deckId: string };
  searchParams: Record<string, string | string[] | undefined>;
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const deckIdParsed = uuidSchema.safeParse(params.deckId);
  if (!deckIdParsed.success) {
    redirect("/create");
  }

  const parsedPagination = paginationSchema.safeParse({
    page: searchParams.page,
    pageSize: searchParams.pageSize,
  });
  const page = parsedPagination.success ? parsedPagination.data.page : 1;
  const pageSize = parsedPagination.success ? parsedPagination.data.pageSize : 25;
  const offset = (page - 1) * pageSize;

  const query = normalizeSearchParam(searchParams.q, 160);
  const queryPattern = query ? toPgLikePattern(query) : "";

  const pool = getPool();
  const deckRes = await pool.query(
    `
      select id, name, is_default, is_archived
      from decks
      where id = $1
        and user_id = $2
      limit 1
    `,
    [deckIdParsed.data, user.id],
  );

  const deckRow = deckRes.rows[0];
  if (!deckRow) {
    redirect("/create");
  }

  const countRes = await pool.query(
    `
      select count(*)::int as count
      from flashcards
      where deck_id = $1
        and char_length(trim(front)) > 0
        and char_length(trim(back)) > 0
        and (
          $2::text = ''
          or front ilike $2 escape '\\'
          or back ilike $2 escape '\\'
        )
    `,
    [deckIdParsed.data, queryPattern],
  );
  const totalCount = Number(countRes.rows[0]?.count ?? 0);

  const cardsRes = await pool.query(
    `
      select id, kind, front, back, mcq_options, mcq_correct_index, p5_code, p5_width, p5_height, created_at
      from flashcards
      where deck_id = $1
        and char_length(trim(front)) > 0
        and char_length(trim(back)) > 0
        and (
          $2::text = ''
          or front ilike $2 escape '\\'
          or back ilike $2 escape '\\'
        )
      order by created_at desc
      limit $3 offset $4
    `,
    [deckIdParsed.data, queryPattern, pageSize, offset],
  );

  const flashcards = cardsRes.rows.map((r) => {
    const p5Code = (r as any).p5_code ? String((r as any).p5_code) : null;
    const rawKind = String((r as any).kind ?? "basic");
    const kind: "basic" | "mcq" = rawKind === "mcq" ? "mcq" : "basic";
    return {
      id: String((r as any).id),
      kind,
      front: String((r as any).front),
      back: String((r as any).back),
      mcqOptions: Array.isArray((r as any).mcq_options)
        ? ((r as any).mcq_options as unknown[]).map((v) => String(v))
        : null,
      mcqCorrectIndex:
        (r as any).mcq_correct_index === null || (r as any).mcq_correct_index === undefined
          ? null
          : Number((r as any).mcq_correct_index),
      p5Code,
      p5Width:
        (r as any).p5_width === null || (r as any).p5_width === undefined
          ? null
          : Number((r as any).p5_width),
      p5Height:
        (r as any).p5_height === null || (r as any).p5_height === undefined
          ? null
          : Number((r as any).p5_height),
      createdAt: String((r as any).created_at),
    };
  });

  return (
    <DeckView
      deck={{
        id: String(deckRow.id),
        name: String(deckRow.name),
        isDefault: Boolean(deckRow.is_default),
        isArchived: Boolean(deckRow.is_archived),
      }}
      flashcards={flashcards}
      query={query}
      page={page}
      pageSize={pageSize}
      totalCount={totalCount}
    />
  );
}
