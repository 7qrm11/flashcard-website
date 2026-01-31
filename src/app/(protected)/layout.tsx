import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import ProtectedShell from "@/ui/protected-shell";
import { getCurrentUser, touchUserActivity } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await touchUserActivity(user.id);

  const avatarVersion = user.avatarUpdatedAt
    ? String(user.avatarUpdatedAt.getTime())
    : null;

  return (
    <ProtectedShell username={user.username} avatarVersion={avatarVersion}>
      {children}
    </ProtectedShell>
  );
}
