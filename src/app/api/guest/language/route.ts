import { NextResponse } from "next/server";
import { z } from "zod";

import { UI_LANGUAGE_COOKIE } from "@/shared/i18n";

export const runtime = "nodejs";

const schema = z.object({
    language: z.enum(["en", "cs"]),
});

export async function POST(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid input" }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(UI_LANGUAGE_COOKIE, parsed.data.language, {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    });
    return res;
}
