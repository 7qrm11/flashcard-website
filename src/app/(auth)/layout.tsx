import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/practice");
  }

  return children;
}
