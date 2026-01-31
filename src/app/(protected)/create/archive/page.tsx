import { redirect } from "next/navigation";

import ArchivedDecksView from "@/features/decks/ui/archived-decks-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { normalizeSearchParam, toPgLikePattern } from "@/shared/search";

export default async function CreateArchivePage({
  searchParams,
}: Readonly<{
  searchParams: Record<string, string | string[] | undefined>;
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const query = normalizeSearchParam(searchParams.q, 120);
  const queryPattern = query ? toPgLikePattern(query) : "";

  const pool = getPool();
  const res = await pool.query(
    `
      select id, name, is_default
      from decks
      where user_id = $1
        and is_archived = true
        and ($2::text = '' or name ilike $2 escape '\\')
      order by is_default desc, created_at asc
    `,
    [user.id, queryPattern],
  );

  const decks = res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    isDefault: Boolean(r.is_default),
  }));

  return <ArchivedDecksView decks={decks} query={query} />;
}
