import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  redirect(`/@${user.username}`);
}
