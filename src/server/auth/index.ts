import "server-only";

import crypto from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPool } from "@/server/db";
import type { ThemeMode } from "@/theme";
import type { UiLanguage } from "@/shared/i18n";

export const SESSION_COOKIE_NAME = "session_token";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type CurrentUser = {
  id: string;
  username: string;
  themeMode: ThemeMode;
  avatarUpdatedAt: Date | null;
  loggingEnabled: boolean;
  uiLanguage: UiLanguage;
};

export function getSessionToken(): string | null {
  return cookies().get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = getSessionToken();
  if (!token) {
    return null;
  }

  const pool = getPool();
  const res = await pool.query(
    `
      select users.id, users.username, users.theme_mode, users.avatar_updated_at, users.logging_enabled, users.ui_language
      from sessions
      join users on users.id = sessions.user_id
      where sessions.token = $1
        and sessions.expires_at > now()
      limit 1
    `,
    [token],
  );

  const row = res.rows[0];
  if (!row) {
    return null;
  }

  const themeMode: ThemeMode = row.theme_mode === "dark" ? "dark" : "light";
  const avatarUpdatedAt: Date | null = row.avatar_updated_at
    ? new Date(row.avatar_updated_at)
    : null;
  const loggingEnabled = row.logging_enabled !== false;
  const uiLanguage: UiLanguage = row.ui_language === "cs" ? "cs" : "en";

  return {
    id: row.id,
    username: row.username,
    themeMode,
    avatarUpdatedAt,
    loggingEnabled,
    uiLanguage,
  };
}

export async function touchUserActivity(userId: string) {
  const pool = getPool();
  await pool.query(
    `
      update users
      set last_active_at = now()
      where id = $1
        and last_active_at < now() - interval '30 seconds'
    `,
    [userId],
  );
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const pool = getPool();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(32).toString("base64url");
    try {
      await pool.query(
        "insert into sessions (user_id, token, expires_at) values ($1, $2, $3)",
        [userId, token, expiresAt],
      );
      return { token, expiresAt };
    } catch (err: any) {
      if (err?.code === "23505") {
        continue;
      }
      throw err;
    }
  }

  throw new Error("could not create session");
}

export async function createSessionWithClient(
  client: Readonly<{ query: (text: string, params?: unknown[]) => Promise<unknown> }>,
  userId: string,
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(32).toString("base64url");
    try {
      await client.query(
        "insert into sessions (user_id, token, expires_at) values ($1, $2, $3)",
        [userId, token, expiresAt],
      );
      return { token, expiresAt };
    } catch (err: any) {
      if (err?.code === "23505") {
        continue;
      }
      throw err;
    }
  }

  throw new Error("could not create session");
}

export function setSessionCookie(
  res: NextResponse,
  token: string,
  expiresAt: Date,
) {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}
