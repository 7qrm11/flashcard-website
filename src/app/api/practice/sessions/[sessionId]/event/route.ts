import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/server/auth";
import { publishUserEvent } from "@/server/events";
import { applyPracticeEvent, getPracticeSessionView } from "@/server/practice";
import { uuidSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("revealBack") }),
  z.object({ type: z.literal("answer"), correct: z.boolean() }),
  z.object({ type: z.literal("advance") }),
  z.object({ type: z.literal("navigate"), to: z.number().int().min(0) }),
  z.object({ type: z.literal("setOutcome"), correct: z.boolean() }),
]);

export async function POST(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const res = await applyPracticeEvent(user.id, sessionIdParsed.data, parsed.data as any);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }

  const view = await getPracticeSessionView(user.id, sessionIdParsed.data);
  if (!view.ok) {
    return NextResponse.json({ error: view.error }, { status: view.status });
  }
  publishUserEvent(user.id, { type: "sync" });
  return NextResponse.json(view);
}
