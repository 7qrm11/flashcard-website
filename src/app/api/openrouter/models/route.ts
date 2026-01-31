import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getOpenRouterModels } from "@/server/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const freeOnly =
    searchParams.get("freeOnly") === "1" || searchParams.get("freeOnly") === "true";

  const res = await getOpenRouterModels({ freeOnly });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 502 });
  }

  return NextResponse.json({ models: res.models });
}

