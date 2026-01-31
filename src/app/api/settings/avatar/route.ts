import { NextResponse } from "next/server";

import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import { publishPublicUserEvent, publishUserEvent } from "@/server/events";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const file = form.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "avatar is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();

  const pool = getPool();
  await pool.query(
    `
      update users
      set avatar_bytes = $1,
          avatar_content_type = $2,
          avatar_updated_at = now()
      where id = $3
    `,
    [Buffer.from(arrayBuffer), file.type, user.id],
  );

  publishUserEvent(user.id, { type: "avatar_updated" });
  publishPublicUserEvent(user.id, { type: "avatar_updated" });

  return NextResponse.json({ ok: true });
}
