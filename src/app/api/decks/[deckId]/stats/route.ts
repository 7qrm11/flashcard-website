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
    "select 1 from decks where id = $1 and user_id = $2 limit 1",
    [deckIdParsed.data, user.id],
  );
  if ((deckRes.rowCount ?? 0) === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const statsRes = await pool.query(
    `
      with playable as (
        select id
        from flashcards
        where deck_id = $1
          and char_length(trim(front)) > 0
          and char_length(trim(back)) > 0
      ),
      learned as (
        select distinct pa.flashcard_id
        from practice_attempts pa
        join playable p on p.id = pa.flashcard_id
        where pa.user_id = $2
      ),
      card_counts as (
        select
          (select count(*)::int from playable) as total_cards,
          (select count(*)::int from learned) as learned_cards
      ),
      due_counts as (
        select count(*)::int as due_now
        from playable p
        join learned l on l.flashcard_id = p.id
        left join flashcard_schedules fs
          on fs.user_id = $2
         and fs.flashcard_id = p.id
        where fs.due_at is null or fs.due_at <= now()
      ),
      attempts_all as (
        select pa.answered_correct, pa.time_ms, pa.answered_at
        from practice_attempts pa
        join playable p on p.id = pa.flashcard_id
        where pa.user_id = $2
      ),
      attempts_stats as (
        select
          count(*)::int as attempts_total,
          count(*) filter (where answered_correct)::int as attempts_correct,
          avg(time_ms)::double precision as avg_time_ms,
          percentile_cont(0.5) within group (order by time_ms) as median_time_ms,
          max(answered_at) as last_practiced_at,
          count(*) filter (where answered_at >= now() - interval '7 days')::int as attempts_7d_total,
          count(*) filter (where answered_correct and answered_at >= now() - interval '7 days')::int as attempts_7d_correct,
          avg(time_ms) filter (where answered_at >= now() - interval '7 days')::double precision as avg_time_7d_ms,
          percentile_cont(0.5) within group (order by time_ms) filter (where answered_at >= now() - interval '7 days') as median_time_7d_ms
        from attempts_all
      )
      select
        card_counts.total_cards,
        card_counts.learned_cards,
        (card_counts.total_cards - card_counts.learned_cards) as novel_cards,
        due_counts.due_now,
        attempts_stats.attempts_total,
        attempts_stats.attempts_correct,
        attempts_stats.avg_time_ms,
        attempts_stats.median_time_ms,
        attempts_stats.last_practiced_at,
        attempts_stats.attempts_7d_total,
        attempts_stats.attempts_7d_correct,
        attempts_stats.avg_time_7d_ms,
        attempts_stats.median_time_7d_ms
      from card_counts, due_counts, attempts_stats
    `,
    [deckIdParsed.data, user.id],
  );

  const row = statsRes.rows[0] as
    | {
        total_cards: number;
        learned_cards: number;
        novel_cards: number;
        due_now: number;
        attempts_total: number;
        attempts_correct: number;
        avg_time_ms: number | null;
        median_time_ms: number | null;
        last_practiced_at: string | null;
        attempts_7d_total: number;
        attempts_7d_correct: number;
        avg_time_7d_ms: number | null;
        median_time_7d_ms: number | null;
      }
    | undefined;

  const totalCards = Number(row?.total_cards ?? 0);
  const learnedCards = Number(row?.learned_cards ?? 0);
  const novelCards = Number(row?.novel_cards ?? Math.max(0, totalCards - learnedCards));
  const dueNow = Number(row?.due_now ?? 0);

  const attemptsTotal = Number(row?.attempts_total ?? 0);
  const attemptsCorrect = Number(row?.attempts_correct ?? 0);
  const accuracy = attemptsTotal > 0 ? attemptsCorrect / attemptsTotal : null;

  const attempts7dTotal = Number(row?.attempts_7d_total ?? 0);
  const attempts7dCorrect = Number(row?.attempts_7d_correct ?? 0);
  const accuracy7d = attempts7dTotal > 0 ? attempts7dCorrect / attempts7dTotal : null;

  return NextResponse.json({
    ok: true,
    flashcards: {
      total: totalCards,
      novel: novelCards,
      learned: learnedCards,
      dueNow,
    },
    reviews: {
      total: attemptsTotal,
      correct: attemptsCorrect,
      accuracy,
      avgTimeMs: row?.avg_time_ms === null ? null : Number(row?.avg_time_ms ?? 0),
      medianTimeMs: row?.median_time_ms === null ? null : Number(row?.median_time_ms ?? 0),
      lastPracticedAt: row?.last_practiced_at ?? null,
      last7d: {
        total: attempts7dTotal,
        correct: attempts7dCorrect,
        accuracy: accuracy7d,
        avgTimeMs: row?.avg_time_7d_ms === null ? null : Number(row?.avg_time_7d_ms ?? 0),
        medianTimeMs:
          row?.median_time_7d_ms === null ? null : Number(row?.median_time_7d_ms ?? 0),
      },
    },
  });
}
