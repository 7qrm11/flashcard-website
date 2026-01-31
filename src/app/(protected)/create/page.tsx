import { redirect } from "next/navigation";

import CreateDecksView from "@/features/decks/ui/create-decks-view";
import { getCurrentUser } from "@/server/auth";
import { sweepStuckAiDeckJobs } from "@/server/ai-deck-worker";
import { getPool } from "@/server/db";
import { normalizeSearchParam, toPgLikePattern } from "@/shared/search";
import { paginationSchema } from "@/shared/validation";

type AiDeckJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  deckId: string | null;
  deckName: string | null;
  prompt: string;
  model: string;
  systemPrompt: string;
  flashcardPrompt: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
};

export default async function CreatePage({
  searchParams,
}: Readonly<{
  searchParams: Record<string, string | string[] | undefined>;
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await sweepStuckAiDeckJobs();

  const parsedPagination = paginationSchema.safeParse({
    page: searchParams.page,
    pageSize: searchParams.pageSize,
  });
  const page = parsedPagination.success ? parsedPagination.data.page : 1;
  const pageSize = parsedPagination.success ? parsedPagination.data.pageSize : 25;
  const offset = (page - 1) * pageSize;

  const query = normalizeSearchParam(searchParams.q, 120);
  const queryPattern = query ? toPgLikePattern(query) : "";

  const pool = getPool();
  const countRes = await pool.query(
    `
      select count(*)::int as count
      from decks
      where user_id = $1
        and is_archived = false
        and ($2::text = '' or name ilike $2 escape '\\')
    `,
    [user.id, queryPattern],
  );
  const totalCount = Number(countRes.rows[0]?.count ?? 0);

  const res = await pool.query(
    `
      select id, name, is_default
      from decks
      where user_id = $1
        and is_archived = false
        and ($2::text = '' or name ilike $2 escape '\\')
      order by is_default desc, created_at desc
      limit $3 offset $4
    `,
    [user.id, queryPattern, pageSize, offset],
  );

  const decks = res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    isDefault: Boolean(r.is_default),
  }));

  const aiSettingsRes = await pool.query(
    `
      select ai_deck_job_logs_enabled, ai_deck_job_logs_retention_ms
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );
  const aiSettingsRow = aiSettingsRes.rows[0] as
    | { ai_deck_job_logs_enabled?: boolean; ai_deck_job_logs_retention_ms?: number }
    | undefined;
  const aiJobLogsEnabled = aiSettingsRow?.ai_deck_job_logs_enabled !== false;
  const aiJobRetentionMsRaw = Number(aiSettingsRow?.ai_deck_job_logs_retention_ms ?? 604800000);
  const aiJobRetentionMs = Number.isFinite(aiJobRetentionMsRaw)
    ? Math.max(0, aiJobRetentionMsRaw)
    : 604800000;

  if (!aiJobLogsEnabled || aiJobRetentionMs <= 0) {
    await pool.query(
      `
        delete from ai_deck_jobs
        where user_id = $1
          and status <> 'running'
      `,
      [user.id],
    );
  } else {
    await pool.query(
      `
        delete from ai_deck_jobs
        where user_id = $1
          and status in ('queued', 'succeeded', 'failed')
          and updated_at < now() - ($2::text || ' milliseconds')::interval
      `,
      [user.id, aiJobRetentionMs],
    );
  }

  const aiJobRes = await pool.query(
    `
      select
        j.id,
        j.status,
        j.deck_id,
        d.name as deck_name,
        j.prompt,
        j.model,
        j.system_prompt,
        j.flashcard_prompt,
        j.error,
        j.started_at,
        j.created_at,
        j.updated_at
      from ai_deck_jobs j
      left join decks d on d.id = j.deck_id
      where j.user_id = $1
      order by j.created_at desc
      limit 50
    `,
    [user.id],
  );

  const aiJobs: AiDeckJob[] = [];
  for (const r of aiJobRes.rows as any[]) {
    const status =
      r?.status === "queued" || r?.status === "running" || r?.status === "succeeded" || r?.status === "failed"
        ? (String(r.status) as AiDeckJob["status"])
        : null;
    if (!status) {
      continue;
    }
    aiJobs.push({
      id: String(r.id),
      status,
      deckId: r.deck_id ? String(r.deck_id) : null,
      deckName: r.deck_name ? String(r.deck_name) : null,
      prompt: String(r.prompt ?? ""),
      model: String(r.model ?? ""),
      systemPrompt: String(r.system_prompt ?? ""),
      flashcardPrompt: String(r.flashcard_prompt ?? ""),
      error: r.error ? String(r.error) : null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    });
  }

  return (
    <CreateDecksView
      aiJobs={aiJobs}
      decks={decks}
      query={query}
      page={page}
      pageSize={pageSize}
      totalCount={totalCount}
    />
  );
}
