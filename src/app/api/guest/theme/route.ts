import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const THEME_COOKIE = "theme_mode";

const schema = z.object({
    mode: z.enum(["light", "dark"]),
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
    res.cookies.set(THEME_COOKIE, parsed.data.mode, {
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
    });
    return res;
}
