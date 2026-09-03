// Resolve the outbound_calls row for an in-flight Twilio leg.
//
// Under high concurrency (hundreds of simultaneous calls, repeat dials to the
// same number) matching on phone number alone picks the wrong row. Twilio
// always sends CallSid (and ParentCallSid on a bridged child leg), so we match
// on the SID first and only fall back to phone-number heuristics.
export interface TwilioLegParams {
  CallSid?: string;
  ParentCallSid?: string;
  To?: string;
  From?: string;
  [k: string]: unknown;
}

export async function findCallForLeg(
  supabase: any,
  params: TwilioLegParams,
  select = "*, clients(*)",
): Promise<any | null> {
  const sids = [params.CallSid, params.ParentCallSid].filter(Boolean) as string[];

  for (const sid of sids) {
    const { data } = await supabase
      .from("outbound_calls")
      .select(select)
      .eq("twilio_call_sid", sid)
      .limit(1);
    if (data?.[0]) return data[0];
  }

  // Fallback: most recent live call for this number (either direction).
  const phones = [params.To, params.From].filter(Boolean) as string[];
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  for (const phone of phones) {
    const { data } = await supabase
      .from("outbound_calls")
      .select(select)
      .eq("phone_number", phone)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(5);
    const rows = (data || []) as any[];
    if (rows.length === 0) continue;
    return (
      rows.find((r) => r.call_status === "in_progress") ??
      rows.find((r) => r.call_status === "ringing" || r.call_status === "initiated") ??
      rows[0]
    );
  }

  // Last resort: legacy rows that stored the SID inside notes.
  for (const sid of sids) {
    const { data } = await supabase
      .from("outbound_calls")
      .select(select)
      .ilike("notes", `%${sid}%`)
      .limit(1);
    if (data?.[0]) return data[0];
  }

  return null;
}
