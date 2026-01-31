import { redirect } from "next/navigation";

export default function SettingsDangerPage() {
  redirect("/settings/account#delete-account");
}
