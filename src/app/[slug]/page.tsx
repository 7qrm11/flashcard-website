import { notFound, redirect } from "next/navigation";

import PublicProfileView from "@/features/profile/ui/public-profile-view";
import ProtectedShell from "@/ui/protected-shell";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const usernameRegex = /^[a-z0-9_.]{1,32}$/u;

function safeDecodeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

function getUsernameFromSlug(slug: string) {
  const trimmedSlug = slug.trim();
  if (trimmedSlug.length === 0) {
    return null;
  }

  if (trimmedSlug.startsWith("@")) {
    return trimmedSlug.slice(1);
  }

  return trimmedSlug;
}

export default async function HandlePage({
  params,
}: Readonly<{
  params: { slug: string };
}>) {
  const currentUser = await getCurrentUser();

  const slugRaw = String(params.slug ?? "");
  const decodedSlug = safeDecodeSlug(slugRaw);
  const usernameRaw = getUsernameFromSlug(decodedSlug);
  if (!usernameRaw) {
    notFound();
  }

  const username = usernameRaw.toLowerCase();
  if (!usernameRegex.test(username)) {
    notFound();
  }

  const canonicalSlug = `@${username}`;
  if (decodedSlug !== canonicalSlug) {
    redirect(`/${canonicalSlug}`);
  }

  const pool = getPool();
  const res = await pool.query(
    `
      select username, created_at, last_active_at, avatar_updated_at
      from users
      where username = $1
      limit 1
    `,
    [username],
  );

  const row = res.rows[0] as
    | {
        username: string;
        created_at: string;
        last_active_at: string;
        avatar_updated_at: string | null;
      }
    | undefined;

  if (!row) {
    notFound();
  }

  const avatarVersion = row.avatar_updated_at
    ? String(new Date(row.avatar_updated_at).getTime())
    : null;

  const page = (
    <PublicProfileView
      avatarVersion={avatarVersion}
      createdAt={String(row.created_at)}
      lastActiveAt={String(row.last_active_at)}
      username={String(row.username)}
    />
  );

  if (!currentUser) {
    return page;
  }

  const currentAvatarVersion = currentUser.avatarUpdatedAt
    ? String(currentUser.avatarUpdatedAt.getTime())
    : null;

  return (
    <ProtectedShell username={currentUser.username} avatarVersion={currentAvatarVersion}>
      {page}
    </ProtectedShell>
  );
}
