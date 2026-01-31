import { redirect } from "next/navigation";

import LoggingSettingsView from "@/features/settings/ui/logging-settings-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function SettingsLogsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const pool = getPool();
  const res = await pool.query(
    `
      select
        logging_enabled,
        logging_retention_ms,
        ai_deck_job_logs_enabled,
        ai_deck_job_logs_retention_ms
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );
  const row = res.rows[0] as
    | {
        logging_enabled: boolean;
        logging_retention_ms: number;
        ai_deck_job_logs_enabled: boolean;
        ai_deck_job_logs_retention_ms: number;
      }
    | undefined;

  const loggingEnabled = row?.logging_enabled !== false;
  const retentionDays = Math.max(0, Math.round(Number(row?.logging_retention_ms ?? 604800000) / DAY_MS));
  const aiDeckJobLogsEnabled = row?.ai_deck_job_logs_enabled !== false;
  const aiDeckJobRetentionDays = Math.max(
    0,
    Math.round(Number(row?.ai_deck_job_logs_retention_ms ?? 604800000) / DAY_MS),
  );

  return (
    <LoggingSettingsView
      aiDeckJobLogsEnabled={aiDeckJobLogsEnabled}
      aiDeckJobLogsRetentionDays={aiDeckJobRetentionDays}
      loggingEnabled={loggingEnabled}
      retentionDays={retentionDays}
    />
  );
}

