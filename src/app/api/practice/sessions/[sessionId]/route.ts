import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPracticeSessionView } from "@/server/practice";
import { uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: { sessionId: string } }>,
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sessionIdParsed = uuidSchema.safeParse(params.sessionId);
  if (!sessionIdParsed.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const view = await getPracticeSessionView(user.id, sessionIdParsed.data, {
    resetRevealState: true,
  });
  if (!view.ok) {
    return NextResponse.json({ error: view.error }, { status: view.status });
  }
  return NextResponse.json(view);
}
