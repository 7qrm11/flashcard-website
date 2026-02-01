import { redirect } from "next/navigation";

import AiSettingsView from "@/features/settings/ui/ai-settings-view";
import { getCurrentUser } from "@/server/auth";
import { getPool } from "@/server/db";
import {
  normalizeOpenrouterFlashcardPrompt,
  normalizeOpenrouterSystemPrompt,
} from "@/shared/openrouter-defaults";

export default async function SettingsAiPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const pool = getPool();
  const settingsRes = await pool.query(
    `
      select
        openrouter_api_key,
        openrouter_model,
        openrouter_only_free_models,
        openrouter_system_prompt,
        openrouter_flashcard_prompt,
        openrouter_params,
        ai_language_lock_enabled,
        ai_provider,
        cerebras_api_key,
        groq_api_key
      from users
      where id = $1
      limit 1
    `,
    [user.id],
  );

  const row = settingsRes.rows[0] as
    | {
      openrouter_api_key: string | null;
      openrouter_model: string | null;
      openrouter_only_free_models: boolean;
      openrouter_system_prompt: string;
      openrouter_flashcard_prompt: string;
      openrouter_params: unknown;
      ai_language_lock_enabled: boolean;
      ai_provider: string | null;
      cerebras_api_key: string | null;
      groq_api_key: string | null;
    }
    | undefined;

  const paramsRaw = (row as any)?.openrouter_params;
  const openrouterParams =
    paramsRaw && typeof paramsRaw === "object" && !Array.isArray(paramsRaw) ? paramsRaw : {};

  return (
    <AiSettingsView
      aiProvider={(row?.ai_provider as "openrouter" | "cerebras" | "groq") ?? "openrouter"}
      openrouterApiKey={row?.openrouter_api_key ?? ""}
      cerebrasApiKey={row?.cerebras_api_key ?? ""}
      groqApiKey={row?.groq_api_key ?? ""}
      openrouterModel={row?.openrouter_model ?? ""}
      openrouterOnlyFreeModels={Boolean(row?.openrouter_only_free_models ?? true)}
      openrouterSystemPrompt={normalizeOpenrouterSystemPrompt(row?.openrouter_system_prompt)}
      openrouterFlashcardPrompt={normalizeOpenrouterFlashcardPrompt(row?.openrouter_flashcard_prompt)}
      openrouterParams={openrouterParams}
      aiLanguageLockEnabled={Boolean((row as any)?.ai_language_lock_enabled ?? true)}
    />
  );
}
