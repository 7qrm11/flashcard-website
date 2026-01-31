import { NextResponse } from "next/server";

import { getPool } from "@/server/db";
import { subscribePublicUserEvents } from "@/server/events";
import { usernameSchema } from "@/shared/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseHeaders() {
  return {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    connection: "keep-alive",
  };
}

export async function GET(
  request: Request,
  { params }: Readonly<{ params: { username: string } }>,
) {
  const parsed = usernameSchema.safeParse(params.username);
  if (!parsed.success) {
    return new NextResponse("not found", { status: 404 });
  }

  const pool = getPool();
  const res = await pool.query(
    "select id from users where username = $1 limit 1",
    [parsed.data],
  );
  const row = res.rows[0] as { id: string } | undefined;
  if (!row?.id) {
    return new NextResponse("not found", { status: 404 });
  }

  const userId = String(row.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "refresh" })}\n\n`));

      const unsubscribe = subscribePublicUserEvents(userId, (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 25_000);

      const abort = () => {
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      };

      if (request.signal.aborted) {
        abort();
        return;
      }

      request.signal.addEventListener("abort", abort);
    },
  });

  return new NextResponse(stream, { headers: sseHeaders() });
}
