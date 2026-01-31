import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/auth";

export default async function NotFound() {
  const user = await getCurrentUser();
  redirect(user ? "/practice" : "/login");
}
