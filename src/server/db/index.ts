import "server-only";

import { Pool, type PoolConfig } from "pg";

function shouldUseSsl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const hostname = url.hostname;
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return false;
    }
    return true;
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!global.__pgPool) {
    const config: PoolConfig = { connectionString: databaseUrl };
    if (shouldUseSsl(databaseUrl)) {
      config.ssl = { rejectUnauthorized: true };
    }
    const pool = new Pool(config);
    pool.on("error", (err) => {
      console.error("pg pool error", err);
    });
    global.__pgPool = pool;
  }

  return global.__pgPool;
}
