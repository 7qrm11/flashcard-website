import { redirect } from "next/navigation";

import AccountSettingsView from "@/features/settings/ui/account-settings-view";
import { getCurrentUser } from "@/server/auth";

export default async function SettingsAccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const avatarVersion = user.avatarUpdatedAt ? String(user.avatarUpdatedAt.getTime()) : null;

  return <AccountSettingsView avatarVersion={avatarVersion} currentUsername={user.username} />;
}
