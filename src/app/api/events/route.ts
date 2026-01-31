import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { subscribeUserEvents } from "@/server/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseHeaders() {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    connection: "keep-alive",
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
        }
      };

      enqueue(`data: ${JSON.stringify({ type: "refresh" })}\n\n`);

      const unsubscribe = subscribeUserEvents(user.id, (event) => {
        enqueue(`data: ${JSON.stringify(event)}\n\n`);
      });

      const keepAlive = setInterval(() => {
        enqueue(`: ping\n\n`);
      }, 25_000);

      const abort = () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
        }
      };

      if (request.signal.aborted) {
        abort();
        return;
      }

      request.signal.addEventListener("abort", abort, { once: true });
    },
  });

  return new NextResponse(stream, { headers: sseHeaders() });
}
