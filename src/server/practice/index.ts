import "server-only";

import { getPool } from "@/server/db";
import {
  applyFlashcardReviewCorrection,
  recordFlashcardReview,
} from "@/server/spaced-repetition";

type DbQueryable = Readonly<{
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}>;

export type PracticeSessionView = {
  ok: true;
  session: {
    id: string;
    deckId: string;
    deckName: string;
    status: "active" | "ended";
    state: "intro" | "front" | "back" | "past" | "done";
    progressIndex: number;
    viewIndex: number;
    queueLength: number;
    daily: {
      novelLimit: number;
      reviewLimit: number;
      novelUsed: number;
      reviewUsed: number;
    };
    current: null | {
      position: number;
      flashcardId: string;
      isNovel: boolean;
      kind: "basic" | "mcq";
      front: string;
      back: string;
      mcqOptions: string[] | null;
      mcqCorrectIndex: number | null;
      p5Code: string | null;
      p5Width: number | null;
      p5Height: number | null;
      answered: null | {
        correct: boolean;
        timeMs: number;
      };
    };
  };
};

function dayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getDailyUsage(userId: string, db: DbQueryable = getPool()) {
  const start = dayStart();
  const res = await db.query(
    `
      select
        count(*) filter (where is_novel = true) as novel_used,
        count(*) filter (where is_novel = false) as review_used
      from practice_attempts
      where user_id = $1
        and answered_at >= $2
    `,
    [userId, start],
  );
  return {
    novelUsed: Number(res.rows[0]?.novel_used ?? 0),
    reviewUsed: Number(res.rows[0]?.review_used ?? 0),
  };
}

export async function createOrResumePracticeSession(userId: string, deckId: string) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const deckRes = await client.query(
      `
        select id, name
        from decks
        where id = $1
          and user_id = $2
          and is_archived = false
        limit 1
      `,
      [deckId, userId],
    );
    const deck = deckRes.rows[0] as { id: string; name: string } | undefined;
    if (!deck) {
      await client.query("commit");
      return { ok: false as const, status: 404 as const, error: "Deck not found" };
    }

    const userRes = await client.query(
      "select daily_novel_limit, daily_review_limit from users where id = $1 limit 1",
      [userId],
    );
    const userRow = userRes.rows[0] as
      | { daily_novel_limit: number; daily_review_limit: number }
      | undefined;
    if (!userRow) {
      await client.query("commit");
      return { ok: false as const, status: 401 as const, error: "Unauthorized" };
    }

    const now = new Date();
    const todayStart = dayStart();

    const hasAnyPlayableRes = await client.query(
      `
        select 1
        from flashcards
        where deck_id = $1
          and char_length(trim(front)) > 0
          and char_length(trim(back)) > 0
        limit 1
      `,
      [deckId],
    );
    if ((hasAnyPlayableRes.rowCount ?? 0) === 0) {
      await client.query("commit");
      return {
        ok: false as const,
        status: 409 as const,
        error: "No flashcards available in this deck",
      };
    }

    const existingRes = await client.query(
      `
        select id, created_at
        from practice_sessions
        where user_id = $1
          and deck_id = $2
          and status = 'active'
        order by created_at desc
        limit 1
      `,
      [userId, deckId],
    );
    const existing = existingRes.rows[0] as { id: string; created_at: string } | undefined;
    if (existing) {
      const createdAt = new Date(existing.created_at);
      if (createdAt >= todayStart) {
        await client.query("commit");
        return { ok: true as const, sessionId: existing.id, deckName: deck.name };
      }
      await client.query("update practice_sessions set status = 'ended' where id = $1", [
        existing.id,
      ]);
    }

    const usage = await getDailyUsage(userId, client);
    const remainingNovel = Math.max(0, Number(userRow.daily_novel_limit) - usage.novelUsed);
    const remainingReview = Math.max(
      0,
      Number(userRow.daily_review_limit) - usage.reviewUsed,
    );
    if (remainingNovel === 0 && remainingReview === 0) {
      await client.query("commit");
      return {
        ok: false as const,
        status: 409 as const,
        error: "Daily limits exhausted",
      };
    }

    const novelAvailableRes = remainingNovel
      ? await client.query(
          `
            select count(*)::int as count
            from flashcards f
            where f.deck_id = $1
              and char_length(trim(f.front)) > 0
              and char_length(trim(f.back)) > 0
              and not exists (
                select 1
                from practice_attempts pa
                where pa.user_id = $2
                  and pa.flashcard_id = f.id
                limit 1
              )
          `,
          [deckId, userId],
        )
      : { rows: [{ count: 0 }] };
    const reviewAvailableRes = remainingReview
      ? await client.query(
          `
            select count(*)::int as count
            from flashcards f
            left join flashcard_schedules fs
              on fs.user_id = $2
             and fs.flashcard_id = f.id
            where f.deck_id = $1
              and char_length(trim(f.front)) > 0
              and char_length(trim(f.back)) > 0
              and exists (
                select 1
                from practice_attempts pa
                where pa.user_id = $2
                  and pa.flashcard_id = f.id
                limit 1
              )
              and (fs.due_at is null or fs.due_at <= now())
          `,
          [deckId, userId],
        )
      : { rows: [{ count: 0 }] };
    const novelAvailable = Math.min(
      remainingNovel,
      Number((novelAvailableRes.rows[0] as any)?.count ?? 0),
    );
    const reviewAvailable = Math.min(
      remainingReview,
      Number((reviewAvailableRes.rows[0] as any)?.count ?? 0),
    );
    if (novelAvailable === 0 && reviewAvailable === 0) {
      await client.query("commit");
      return {
        ok: false as const,
        status: 409 as const,
        error: "No flashcards available within daily limits",
      };
    }

    const sessionRes = await client.query(
      `
        insert into practice_sessions (user_id, deck_id, status, progress_index, view_index, state, created_at, updated_at)
        values ($1, $2, 'active', 0, 0, 'intro', $3, $3)
        returning id
      `,
      [userId, deckId, now],
    );
    const sessionId = String(sessionRes.rows[0]?.id);

    let position = 0;
    if (remainingReview > 0) {
      const reviewRes = await client.query(
        `
          select f.id
          from flashcards f
          left join flashcard_schedules fs
            on fs.user_id = $2
           and fs.flashcard_id = f.id
          where f.deck_id = $1
            and char_length(trim(f.front)) > 0
            and char_length(trim(f.back)) > 0
            and exists (
              select 1
              from practice_attempts pa
              where pa.user_id = $2
                and pa.flashcard_id = f.id
              limit 1
              )
              and (fs.due_at is null or fs.due_at <= now())
          order by fs.interval_ms asc nulls first, fs.due_at asc nulls first, f.created_at asc
          limit $3
        `,
        [deckId, userId, reviewAvailable],
      );
      const ids = reviewRes.rows.map((r) => String(r.id));
      if (ids.length > 0) {
        await client.query(
          `
            with rows as (
              select t.flashcard_id, t.ord
              from unnest($1::uuid[]) with ordinality as t(flashcard_id, ord)
            )
            insert into practice_session_queue (session_id, position, flashcard_id, is_novel)
            select $2, $3 + (ord - 1), flashcard_id, false
            from rows
            order by ord asc
          `,
          [ids, sessionId, position],
        );
        position += ids.length;
      }
    }

    if (remainingNovel > 0) {
      const novelRes = await client.query(
        `
          select f.id
          from flashcards f
          where f.deck_id = $1
            and char_length(trim(f.front)) > 0
            and char_length(trim(f.back)) > 0
            and not exists (
              select 1
              from practice_attempts pa
              where pa.user_id = $2
                and pa.flashcard_id = f.id
              limit 1
            )
          order by f.created_at asc
          limit $3
        `,
        [deckId, userId, novelAvailable],
      );
      const ids = novelRes.rows.map((r) => String(r.id));
      if (ids.length > 0) {
        await client.query(
          `
            with rows as (
              select t.flashcard_id, t.ord
              from unnest($1::uuid[]) with ordinality as t(flashcard_id, ord)
            )
            insert into practice_session_queue (session_id, position, flashcard_id, is_novel)
            select $2, $3 + (ord - 1), flashcard_id, true
            from rows
            order by ord asc
          `,
          [ids, sessionId, position],
        );
        position += ids.length;
      }
    }

    if (position === 0) {
      await client.query(
        "update practice_sessions set status = 'ended', state = 'done' where id = $1",
        [sessionId],
      );
    }

    await client.query("commit");
    return { ok: true as const, sessionId, deckName: deck.name };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function getPracticeSessionView(
  userId: string,
  sessionId: string,
  options?: Readonly<{ resetRevealState?: boolean }>,
) {
  const pool = getPool();
  const resetRevealState = options?.resetRevealState ?? false;

  const sessionRes = await pool.query(
    `
      select s.id, s.deck_id, s.status, s.progress_index, s.view_index, s.state,
             s.front_started_at, s.front_elapsed_ms,
             d.name as deck_name,
             u.daily_novel_limit, u.daily_review_limit
      from practice_sessions s
      join decks d on d.id = s.deck_id
      join users u on u.id = s.user_id
      where s.id = $1
        and s.user_id = $2
      limit 1
    `,
    [sessionId, userId],
  );

  const row = sessionRes.rows[0] as
    | {
        id: string;
        deck_id: string;
        status: "active" | "ended";
        progress_index: number;
        view_index: number;
        state: "intro" | "front" | "back" | "past" | "done";
        front_started_at: string | null;
        front_elapsed_ms: number;
        deck_name: string;
        daily_novel_limit: number;
        daily_review_limit: number;
      }
    | undefined;

  if (!row) {
    return { ok: false as const, status: 404 as const, error: "Not found" };
  }

  if (resetRevealState && (row.state === "front" || row.state === "back")) {
    const pos = Math.max(0, Math.floor(Number(row.progress_index ?? 0)));
    const attemptRes = await pool.query(
      `
        select 1
        from practice_attempts
        where session_id = $1
          and user_id = $2
          and position = $3
        limit 1
      `,
      [sessionId, userId, pos],
    );
    const alreadyAnswered = (attemptRes.rowCount ?? 0) > 0;
    if (!alreadyAnswered) {
      await pool.query(
        `
          update practice_sessions
          set state = 'intro',
              front_started_at = null,
              front_elapsed_ms = 0,
              updated_at = now()
          where id = $1
            and user_id = $2
        `,
        [sessionId, userId],
      );
      row.state = "intro";
      row.front_started_at = null;
      row.front_elapsed_ms = 0;
    }
  }

  const queueRes = await pool.query(
    `
      select q.position, q.flashcard_id, q.is_novel,
             f.kind, f.front, f.back, f.mcq_options, f.mcq_correct_index, f.p5_code, f.p5_width, f.p5_height
      from practice_session_queue q
      join flashcards f on f.id = q.flashcard_id
      where q.session_id = $1
      order by q.position asc
    `,
    [sessionId],
  );

  const queueLength = queueRes.rowCount ?? 0;

  const attemptsRes = await pool.query(
    `
      select position, answered_correct, time_ms
      from practice_attempts
      where session_id = $1
        and user_id = $2
      order by position asc
    `,
    [sessionId, userId],
  );
  const attemptByPos = new Map<
    number,
    { correct: boolean; timeMs: number }
  >();
  for (const a of attemptsRes.rows as any[]) {
    attemptByPos.set(Number(a.position), {
      correct: Boolean(a.answered_correct),
      timeMs: Number(a.time_ms),
    });
  }

  const usage = await getDailyUsage(userId);

  const progressIndex = Number(row.progress_index ?? 0);
  const viewIndex = Number(row.view_index ?? 0);
  const clampedProgress = Math.max(0, Math.min(progressIndex, queueLength));
  const clampedView = Math.max(0, Math.min(viewIndex, clampedProgress));

  const currentRow = queueRes.rows.find((r) => Number(r.position) === clampedView) as
    | {
        position: number;
        flashcard_id: string;
        is_novel: boolean;
        kind: string;
        front: string;
        back: string;
        mcq_options: unknown;
        mcq_correct_index: unknown;
        p5_code: unknown;
        p5_width: unknown;
        p5_height: unknown;
      }
    | undefined;

  const currentP5Code = currentRow?.p5_code ? String(currentRow.p5_code) : null;

  return {
    ok: true as const,
    session: {
      id: String(row.id),
      deckId: String(row.deck_id),
      deckName: String(row.deck_name),
      status: row.status,
      state: clampedView < clampedProgress ? "past" : row.state,
      progressIndex: clampedProgress,
      viewIndex: clampedView,
      queueLength,
      daily: {
        novelLimit: Number(row.daily_novel_limit),
        reviewLimit: Number(row.daily_review_limit),
        novelUsed: usage.novelUsed,
        reviewUsed: usage.reviewUsed,
      },
      current: currentRow
        ? {
            position: Number(currentRow.position),
            flashcardId: String(currentRow.flashcard_id),
            isNovel: Boolean(currentRow.is_novel),
            kind:
              currentRow.kind === "mcq" ? "mcq" : "basic",
            front: String(currentRow.front),
            back: String(currentRow.back),
            mcqOptions: Array.isArray(currentRow.mcq_options)
              ? (currentRow.mcq_options as unknown[]).map((v) => String(v))
              : null,
            mcqCorrectIndex:
              currentRow.mcq_correct_index === null || currentRow.mcq_correct_index === undefined
                ? null
                : Number(currentRow.mcq_correct_index),
            p5Code: currentP5Code,
            p5Width:
              currentRow.p5_width === null || currentRow.p5_width === undefined
                ? null
                : Number(currentRow.p5_width),
            p5Height:
              currentRow.p5_height === null || currentRow.p5_height === undefined
                ? null
                : Number(currentRow.p5_height),
            answered: attemptByPos.get(Number(currentRow.position)) ?? null,
          }
        : null,
    },
  };
}

type PracticeEvent =
  | { type: "start" }
  | { type: "revealBack" }
  | { type: "answer"; correct: boolean }
  | { type: "advance" }
  | { type: "navigate"; to: number }
  | { type: "setOutcome"; correct: boolean };

export async function applyPracticeEvent(
  userId: string,
  sessionId: string,
  event: PracticeEvent,
) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const lockedRes = await client.query(
      `
        select id, deck_id, status, progress_index, view_index, state, front_started_at, front_elapsed_ms
        from practice_sessions
        where id = $1
          and user_id = $2
        for update
      `,
      [sessionId, userId],
    );
    const s = lockedRes.rows[0] as
      | {
          id: string;
          deck_id: string;
          status: "active" | "ended";
          progress_index: number;
          view_index: number;
          state: "intro" | "front" | "back" | "past" | "done";
          front_started_at: string | null;
          front_elapsed_ms: number;
        }
      | undefined;
    if (!s) {
      await client.query("rollback");
      return { ok: false as const, status: 404 as const, error: "Not found" };
    }

    const queueCountRes = await client.query(
      "select count(*)::int as count from practice_session_queue where session_id = $1",
      [sessionId],
    );
    const queueLength = Number(queueCountRes.rows[0]?.count ?? 0);
    const progressIndex = Math.max(0, Math.min(Number(s.progress_index ?? 0), queueLength));
    const viewIndex = Math.max(0, Math.min(Number(s.view_index ?? 0), progressIndex));
    const isActive = s.status === "active";

    const setState = async (patch: Partial<{
      status: "active" | "ended";
      progressIndex: number;
      viewIndex: number;
      state: "intro" | "front" | "back" | "past" | "done";
      frontStartedAt: Date | null;
      frontElapsedMs: number;
    }>) => {
      await client.query(
        `
          update practice_sessions
          set
            status = coalesce($1, status),
            progress_index = coalesce($2, progress_index),
            view_index = coalesce($3, view_index),
            state = coalesce($4, state),
            front_started_at = $5,
            front_elapsed_ms = coalesce($6, front_elapsed_ms),
            updated_at = now()
          where id = $7
            and user_id = $8
        `,
        [
          patch.status ?? null,
          patch.progressIndex ?? null,
          patch.viewIndex ?? null,
          patch.state ?? null,
          patch.frontStartedAt === undefined ? s.front_started_at : patch.frontStartedAt,
          patch.frontElapsedMs ?? null,
          sessionId,
          userId,
        ],
      );
    };

    if (event.type === "navigate") {
      const to = Math.max(0, Math.min(Math.floor(event.to), progressIndex));
      const currentAttemptRes = await client.query(
        `
          select 1
          from practice_attempts
          where session_id = $1
            and user_id = $2
            and position = $3
          limit 1
        `,
        [sessionId, userId, progressIndex],
      );
      const currentAnswered = (currentAttemptRes.rowCount ?? 0) > 0;
      const leavingCurrentUnanswered =
        viewIndex === progressIndex &&
        (s.state === "front" || s.state === "back") &&
        !currentAnswered;
      await setState({
        viewIndex: to,
        state:
          to < progressIndex
            ? "past"
            : !isActive
              ? "done"
              : currentAnswered && to === progressIndex
                ? "back"
                : "intro",
        frontStartedAt: leavingCurrentUnanswered ? null : undefined,
        frontElapsedMs: leavingCurrentUnanswered ? 0 : undefined,
      });
      await client.query("commit");
      return { ok: true as const };
    }

    if (event.type === "start") {
      if (!isActive) {
        await client.query("rollback");
        return { ok: false as const, status: 409 as const, error: "Session ended" };
      }
      if (progressIndex >= queueLength) {
        await setState({ status: "ended", state: "done" });
        await client.query("commit");
        return { ok: true as const };
      }
      if (viewIndex !== progressIndex || s.state !== "intro") {
        await client.query("commit");
        return { ok: true as const };
      }
      await setState({ state: "front", frontStartedAt: new Date(), frontElapsedMs: 0 });
      await client.query("commit");
      return { ok: true as const };
    }

    if (event.type === "revealBack") {
      if (!isActive) {
        await client.query("rollback");
        return { ok: false as const, status: 409 as const, error: "Session ended" };
      }
      if (viewIndex !== progressIndex || s.state !== "front") {
        await client.query("commit");
        return { ok: true as const };
      }
      const started = s.front_started_at ? new Date(s.front_started_at) : null;
      const elapsed = started ? Math.max(0, Date.now() - started.getTime()) : 0;
      await setState({
        state: "back",
        frontStartedAt: null,
        frontElapsedMs: elapsed,
      });
      await client.query("commit");
      return { ok: true as const };
    }

    if (event.type === "answer") {
      if (!isActive) {
        await client.query("rollback");
        return { ok: false as const, status: 409 as const, error: "Session ended" };
      }
      if (viewIndex !== progressIndex || s.state !== "back") {
        await client.query("commit");
        return { ok: true as const };
      }

      const qRes = await client.query(
        `
          select flashcard_id, is_novel
          from practice_session_queue
          where session_id = $1
            and position = $2
          limit 1
        `,
        [sessionId, progressIndex],
      );
      const q = qRes.rows[0] as { flashcard_id: string; is_novel: boolean } | undefined;
      if (!q) {
        await setState({ status: "ended", state: "done" });
        await client.query("commit");
        return { ok: true as const };
      }

      const timeMs = Math.max(0, Number(s.front_elapsed_ms ?? 0));
      const initialAnsweredAt = new Date();

      const insertedAttemptRes = await client.query(
        `
          insert into practice_attempts
            (user_id, session_id, deck_id, flashcard_id, position, is_novel, answered_correct, time_ms, answered_at)
          values
            ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (session_id, position) do nothing
          returning answered_at
        `,
        [
          userId,
          sessionId,
          s.deck_id,
          q.flashcard_id,
          progressIndex,
          Boolean(q.is_novel),
          Boolean(event.correct),
          timeMs,
          initialAnsweredAt,
        ],
      );

      if ((insertedAttemptRes.rowCount ?? 0) > 0) {
        await recordFlashcardReview(client, userId, String(q.flashcard_id), {
          correct: Boolean(event.correct),
          timeMs,
          answeredAt: initialAnsweredAt,
        });
      } else {
        const updatedAttemptRes = await client.query(
          `
            update practice_attempts
            set answered_correct = $1,
                time_ms = $2
            where session_id = $3
              and user_id = $4
              and position = $5
            returning answered_at
          `,
          [Boolean(event.correct), timeMs, sessionId, userId, progressIndex],
        );
        const answeredAtRaw = updatedAttemptRes.rows[0]?.answered_at;
        const answeredAt =
          answeredAtRaw instanceof Date
            ? answeredAtRaw
            : answeredAtRaw
              ? new Date(answeredAtRaw)
              : initialAnsweredAt;
        await applyFlashcardReviewCorrection(client, userId, String(q.flashcard_id), {
          correct: Boolean(event.correct),
          timeMs,
          answeredAt,
        });
      }

      await setState({ state: "back", frontStartedAt: null, frontElapsedMs: timeMs });

      await client.query("commit");
      return { ok: true as const };
    }

    if (event.type === "advance") {
      if (!isActive) {
        await client.query("rollback");
        return { ok: false as const, status: 409 as const, error: "Session ended" };
      }
      if (viewIndex !== progressIndex || s.state !== "back") {
        await client.query("commit");
        return { ok: true as const };
      }

      const attemptRes = await client.query(
        `
          select 1
          from practice_attempts
          where session_id = $1
            and user_id = $2
            and position = $3
          limit 1
        `,
        [sessionId, userId, progressIndex],
      );
      if ((attemptRes.rowCount ?? 0) === 0) {
        await client.query("rollback");
        return { ok: false as const, status: 409 as const, error: "Answer the flashcard first" };
      }

      const nextProgress = Math.min(queueLength, progressIndex + 1);
      if (nextProgress >= queueLength) {
        await setState({
          status: "ended",
          state: "done",
          progressIndex: nextProgress,
          viewIndex: nextProgress,
          frontStartedAt: null,
          frontElapsedMs: 0,
        });
      } else {
        await setState({
          state: "intro",
          progressIndex: nextProgress,
          viewIndex: nextProgress,
          frontStartedAt: null,
          frontElapsedMs: 0,
        });
      }

      await client.query("commit");
      return { ok: true as const };
    }

    if (event.type === "setOutcome") {
      if (viewIndex >= progressIndex) {
        await client.query("commit");
        return { ok: true as const };
      }
      await client.query(
        `
          update practice_attempts
          set answered_correct = $1
          where session_id = $2
            and user_id = $3
            and position = $4
        `,
        [Boolean(event.correct), sessionId, userId, viewIndex],
      );

      const attemptRes = await client.query(
        `
          select flashcard_id, answered_at, time_ms
          from practice_attempts
          where session_id = $1
            and user_id = $2
            and position = $3
          limit 1
        `,
        [sessionId, userId, viewIndex],
      );
      const attempt = attemptRes.rows[0] as
        | { flashcard_id: string; answered_at: string; time_ms: number }
        | undefined;
      if (attempt?.flashcard_id && attempt?.answered_at) {
        await applyFlashcardReviewCorrection(client, userId, String(attempt.flashcard_id), {
          correct: Boolean(event.correct),
          timeMs: Number(attempt.time_ms ?? 0),
          answeredAt: new Date(attempt.answered_at),
        });
      }
      await client.query("commit");
      return { ok: true as const };
    }

    await client.query("commit");
    return { ok: true as const };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
