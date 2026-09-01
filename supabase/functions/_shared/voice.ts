// Single source of truth for the synthesized voice used across every call
// leg. Keeping one voice everywhere makes the transition between an uploaded
// recording and a system-spoken value (client name, premium, due date) feel
// like ONE continuous message instead of two different systems.
export const TTS_VOICE = 'Polly.Joanna-Neural';

// Seam between a <Play> recording and a <Say> value. Twilio inserts no gap by
// default, so we emit nothing here — a named helper keeps the intent explicit
// and prevents anyone re-adding a 1s pause mid-sentence.
export const SEAM = '';

export function say(text: string, opts?: { voice?: string }): string {
  if (!text) return '';
  return `<Say voice="${opts?.voice ?? TTS_VOICE}">${text}</Say>`;
}
