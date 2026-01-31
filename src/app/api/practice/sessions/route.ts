import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { createOrResumePracticeSession } from "@/server/practice";
import { z } from "zod";
import { uuidSchema } from "@/shared/validation";
import { publishUserEvent } from "@/server/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSessionSchema = z.object({
  deckId: uuidSchema,
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  try {
    const res = await createOrResumePracticeSession(user.id, parsed.data.deckId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    publishUserEvent(user.id, { type: "sync" });
    return NextResponse.json({ ok: true, sessionId: res.sessionId });
  } catch (err: any) {
    console.error("practice session start failed", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
