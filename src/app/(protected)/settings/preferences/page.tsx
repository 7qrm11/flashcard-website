import { redirect } from "next/navigation";

import PreferencesSettingsView from "@/features/settings/ui/preferences-settings-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";

export default async function SettingsPreferencesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const pool = getPool();
  const settingsRes = await pool.query(
    `
      select
        daily_novel_limit,
        daily_review_limit,
        ui_language,
        scheduler_base_interval_ms,
        scheduler_reward_multiplier,
        scheduler_penalty_multiplier,
        scheduler_required_time_ms,
        scheduler_time_history_limit
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );
  const row = settingsRes.rows[0] as
    | { daily_novel_limit: number; daily_review_limit: number }
    | undefined;

  const dailyNovelLimit = Number(row?.daily_novel_limit ?? 50);
  const dailyReviewLimit = Number(row?.daily_review_limit ?? 200);

  return (
    <PreferencesSettingsView
      dailyNovelLimit={dailyNovelLimit}
      dailyReviewLimit={dailyReviewLimit}
      uiLanguage={String((row as any)?.ui_language ?? "en") === "cs" ? "cs" : "en"}
      schedulerBaseIntervalMinutes={Math.max(
        1,
        Math.round(Number((row as any)?.scheduler_base_interval_ms ?? 1800000) / 60000),
      )}
      schedulerPenaltyMultiplier={Number((row as any)?.scheduler_penalty_multiplier ?? 0.6)}
      schedulerRequiredTimeSeconds={Math.max(
        0,
        Math.round(Number((row as any)?.scheduler_required_time_ms ?? 10000) / 1000),
      )}
      schedulerRewardMultiplier={Number((row as any)?.scheduler_reward_multiplier ?? 1.8)}
      schedulerTimeHistoryLimit={Math.max(1, Number((row as any)?.scheduler_time_history_limit ?? 10))}
    />
  );
}
