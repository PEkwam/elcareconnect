import type { Tables } from "@/integrations/supabase/types";

/**
 * Shared row → typed-shape mappers so every component uses the same
 * defaults when the Supabase schema has nullable columns the UI treats
 * as required.
 */

// ---------- supported_languages ----------
export type LanguageRow = Tables<"supported_languages">;
export interface NormalizedLanguage extends LanguageRow {
  display_order: number;
  is_active: boolean;
  tts_provider: string;
  greeting_text: string | null;
  menu_prompt_text: string | null;
  greeting_audio_url: string | null;
  menu_audio_url: string | null;
}

export function normalizeLanguage(row: LanguageRow): NormalizedLanguage {
  return {
    ...row,
    display_order: row.display_order ?? 0,
    is_active: row.is_active ?? true,
    tts_provider: (row as any).tts_provider ?? "browser",
    greeting_text: (row as any).greeting_text ?? null,
    menu_prompt_text: (row as any).menu_prompt_text ?? null,
    greeting_audio_url: (row as any).greeting_audio_url ?? null,
    menu_audio_url: (row as any).menu_audio_url ?? null,
  };
}

export const normalizeLanguages = (rows: LanguageRow[] | null | undefined) =>
  (rows ?? []).map(normalizeLanguage);

// ---------- sms_campaigns ----------
export type SMSCampaignRow = Tables<"sms_campaigns">;
export interface NormalizedSMSCampaign extends SMSCampaignRow {
  message_template: string;
  channel: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  scheduled_at: string | null;
  completed_at: string | null;
}

export function normalizeSMSCampaign(row: SMSCampaignRow): NormalizedSMSCampaign {
  const r = row as any;
  return {
    ...row,
    message_template: r.message_template ?? row.message ?? "",
    channel: r.channel ?? "sms",
    status: row.status ?? "draft",
    total_recipients: r.total_recipients ?? 0,
    sent_count: row.sent_count ?? 0,
    delivered_count: r.delivered_count ?? 0,
    failed_count: r.failed_count ?? 0,
    scheduled_at: r.scheduled_at ?? null,
    completed_at: r.completed_at ?? null,
  };
}

export const normalizeSMSCampaigns = (rows: SMSCampaignRow[] | null | undefined) =>
  (rows ?? []).map(normalizeSMSCampaign);

/**
 * Build a write-payload that satisfies the current schema where both
 * `message` (legacy) and `message_template` exist. Empty datetime strings
 * are coerced to null so Postgres accepts them.
 */
export function buildSMSCampaignPayload(input: {
  name: string;
  message_template: string;
  channel: string;
  scheduled_at?: string | null;
  completed_at?: string | null;
  total_recipients?: number;
  status?: string;
}) {
  const scheduled = input.scheduled_at ? input.scheduled_at : null;
  const completed = input.completed_at ? input.completed_at : null;
  return {
    name: input.name,
    message: input.message_template,
    message_template: input.message_template,
    channel: input.channel,
    scheduled_at: scheduled,
    completed_at: completed,
    total_recipients: input.total_recipients ?? 0,
    status: input.status ?? (scheduled ? "scheduled" : "draft"),
  };
}

// ---------- call_queue ----------
export type CallQueueRow = Tables<"call_queue">;
export interface NormalizedQueuedCall extends CallQueueRow {
  clients: { name: string; phone: string } | null;
}

type RawQueuedCall = CallQueueRow & {
  clients?: { name: string; phone: string } | null | { error: true } | unknown;
};

export function normalizeQueuedCall(row: RawQueuedCall): NormalizedQueuedCall {
  const c = row.clients as any;
  const clients =
    c && typeof c === "object" && !("error" in c) && "name" in c && "phone" in c
      ? { name: c.name as string, phone: c.phone as string }
      : null;
  return { ...(row as CallQueueRow), clients };
}

export const normalizeQueuedCalls = (rows: RawQueuedCall[] | null | undefined) =>
  (rows ?? []).map(normalizeQueuedCall);
