import { redirect } from "next/navigation";

import PracticeDecksView from "@/features/practice/ui/practice-decks-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { normalizeSearchParam, toPgLikePattern } from "@/shared/search";
import { paginationSchema } from "@/shared/validation";

export default async function PracticePage({
  searchParams,
}: Readonly<{
  searchParams: Record<string, string | string[] | undefined>;
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

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
      select id, name
      from decks
      where user_id = $1
        and is_archived = false
        and ($2::text = '' or name ilike $2 escape '\\')
      order by is_default desc, created_at asc
      limit $3 offset $4
    `,
    [user.id, queryPattern, pageSize, offset],
  );

  const decks = res.rows.map((r) => ({ id: String(r.id), name: String(r.name) }));

  return (
    <PracticeDecksView
      decks={decks}
      query={query}
      page={page}
      pageSize={pageSize}
      totalCount={totalCount}
    />
  );
}
