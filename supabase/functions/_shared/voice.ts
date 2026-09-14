// Single source of truth for the voice the system speaks with on every call
// leg.
//
// Uploaded campaign recordings are real human voice. Twilio's built-in <Say>
// engine sounds noticeably synthetic next to them, so a message that mixes a
// recording with a spoken detail ("Dear <name>", "your premium of <amount>")
// feels like two different systems talking.
//
// To close that gap every <Say> is rendered to natural neural speech through
// the built-in AI voice, cached in storage, and played back with <Play> —
// the same delivery mechanism as the human recordings. If synthesis is
// unavailable for any reason the original <Say> is left untouched, so a call
// never fails because of the voice layer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Twilio's fallback voice, used only when natural synthesis is unavailable.
export const TTS_VOICE = 'Polly.Joanna-Neural';

// Natural voice settings. `alloy` is a warm, neutral narrator that sits well
// beside recorded human speech. Delivery instructions keep the pace and tone
// matched to a person reading a letter aloud rather than an announcement.
const NATURAL_MODEL = 'openai/gpt-4o-mini-tts';
const NATURAL_VOICE = 'alloy';
const NATURAL_INSTRUCTIONS =
  'Speak like a warm, friendly human customer-care officer reading aloud over a phone call. ' +
  'Natural conversational pace, gentle intonation, clear but unhurried. ' +
  'Do not sound like an automated system or an announcement.';

const BUCKET = 'language-audio';
const PREFIX = 'tts';

// Seam between a <Play> recording and a spoken value. Twilio inserts no gap by
// default, so we emit nothing here — a named helper keeps the intent explicit
// and prevents anyone re-adding a 1s pause mid-sentence.
export const SEAM = '';

export function say(text: string, opts?: { voice?: string }): string {
  if (!text) return '';
  return `<Say voice="${opts?.voice ?? TTS_VOICE}">${text}</Say>`;
}

// ---------------------------------------------------------------------------
// Natural voice rendering
// ---------------------------------------------------------------------------

const urlCache = new Map<string, string>();

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Render one phrase to a cached natural-voice mp3 and return its public URL.
 * Returns null when synthesis is unavailable — callers keep their <Say>.
 */
export async function naturalAudioUrl(text: string): Promise<string | null> {
  const clean = text.trim();
  if (!clean) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
  if (!supabaseUrl || !serviceKey || !lovableApiKey) return null;

  try {
    const key = await sha256Hex(`${NATURAL_MODEL}|${NATURAL_VOICE}|${clean}`);
    const path = `${PREFIX}/${key}.mp3`;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;

    const cached = urlCache.get(key);
    if (cached) return cached;

    // Already synthesized on an earlier call? Reuse it — repeated phrases
    // (menus, greetings) are only ever generated once.
    const head = await fetch(publicUrl, { method: 'HEAD' });
    if (head.ok) {
      urlCache.set(key, publicUrl);
      return publicUrl;
    }

    const speech = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NATURAL_MODEL,
        input: clean,
        voice: NATURAL_VOICE,
        instructions: NATURAL_INSTRUCTIONS,
        response_format: 'mp3',
      }),
    });

    if (!speech.ok) {
      console.error(`Natural voice synthesis failed [${speech.status}]: ${await speech.text()}`);
      return null;
    }

    const audio = new Uint8Array(await speech.arrayBuffer());
    if (audio.byteLength === 0) return null;

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });
    if (error) {
      console.error(`Natural voice upload failed: ${error.message}`);
      return null;
    }

    urlCache.set(key, publicUrl);
    return publicUrl;
  } catch (err) {
    console.error('Natural voice error:', err);
    return null;
  }
}

/**
 * Rewrite every <Say> in a TwiML document into a <Play> of natural speech so
 * spoken details blend seamlessly with uploaded human recordings.
 * Any phrase that cannot be synthesized keeps its original <Say>.
 */
export async function naturalizeTwiml(twiml: string): Promise<string> {
  if (!twiml || !twiml.includes('<Say')) return twiml;

  const matches = [...twiml.matchAll(/<Say\b[^>]*>([\s\S]*?)<\/Say>/g)];
  if (matches.length === 0) return twiml;

  // Unique phrases only — a repeated prompt is synthesized once per response.
  const phrases = [...new Set(matches.map((m) => decodeXml(m[1]).trim()).filter(Boolean))];
  const rendered = new Map<string, string>();
  await Promise.all(
    phrases.map(async (phrase) => {
      const url = await naturalAudioUrl(phrase);
      if (url) rendered.set(phrase, url);
    }),
  );

  if (rendered.size === 0) return twiml;

  return twiml.replace(/<Say\b[^>]*>([\s\S]*?)<\/Say>/g, (whole, inner: string) => {
    const url = rendered.get(decodeXml(inner).trim());
    return url ? `<Play>${url}</Play>` : whole;
  });
}

/**
 * Wraps a Twilio webhook handler so every TwiML response it returns is spoken
 * in the natural voice. Non-XML responses pass through untouched.
 */
export function withNaturalVoice(
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const response = await handler(req);
    try {
      const contentType = response.headers.get('Content-Type') ?? '';
      if (!contentType.includes('xml')) return response;
      const body = await response.text();
      const natural = await naturalizeTwiml(body);
      return new Response(natural, {
        status: response.status,
        headers: response.headers,
      });
    } catch (err) {
      console.error('withNaturalVoice failed, serving original TwiML:', err);
      return response;
    }
  };
}
