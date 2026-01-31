import { redirect } from "next/navigation";

import PracticeSessionView from "@/features/practice/ui/practice-session-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { uuidSchema } from "@/shared/validation";

export default async function PracticeDeckSessionPage({
  params,
}: Readonly<{
  params: { deckId: string };
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const deckIdParsed = uuidSchema.safeParse(params.deckId);
  if (!deckIdParsed.success) {
    redirect("/practice");
  }

  const pool = getPool();
  const deckRes = await pool.query(
    `
      select id, name
      from decks
      where id = $1
        and user_id = $2
        and is_archived = false
      limit 1
    `,
    [deckIdParsed.data, user.id],
  );
  const deckRow = deckRes.rows[0] as { id: string; name: string } | undefined;
  if (!deckRow) {
    redirect("/practice");
  }

  return (
    <PracticeSessionView deckId={String(deckRow.id)} sessionId={null} />
  );
}
