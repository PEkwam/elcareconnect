// Local language voice playback. Prefers admin-uploaded MP3, falls back to
// browser SpeechSynthesis with the configured greeting text.

import { supabase } from '@/integrations/supabase/client';

const FALLBACK_LANG_TAG: Record<string, string> = {
  en: 'en-US',
  tw: 'en-GH',
  ga: 'en-GH',
  ee: 'en-GH',
  ha: 'en-NG',
};

const FALLBACK_GREETING: Record<string, string> = {
  en: 'Hello, welcome! How may I help you today?',
  tw: 'Akwaaba! Mepa wo kyɛw, meboa wo sɛn?',
  ga: 'Ojekoo! Mɛ ji bo ahe?',
  ee: 'Woezɔ! Aleke mateŋu akpe nuwò?',
  ha: 'Barka dai! Yaya zan taimaka muku?',
};

function speakWithBrowser(text: string, languageCode: string) {
  if (!('speechSynthesis' in window)) return;
  const langTag = FALLBACK_LANG_TAG[languageCode] || 'en-US';
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langTag;
  utterance.rate = 0.9;
  const voices = speechSynthesis.getVoices();
  const match = voices.find((v) => v.lang.startsWith(langTag.split('-')[0]));
  if (match) utterance.voice = match;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

/**
 * Play the greeting for the selected language.
 * 1. If admin uploaded an MP3 → play it
 * 2. Else if greeting_text + browser TTS provider → speak via SpeechSynthesis
 * 3. Else → fall back to baked-in greeting
 */
export async function speakGreeting(languageCode: string): Promise<void> {
  try {
    const { data } = await supabase
      .from('supported_languages')
      .select('greeting_text, greeting_audio_url, tts_provider')
      .eq('code', languageCode)
      .eq('is_active', true)
      .maybeSingle();

    // 1. Pre-recorded MP3 wins
    if (data?.greeting_audio_url) {
      const audio = new Audio(data.greeting_audio_url);
      audio.play().catch((err) => {
        console.warn('Audio playback failed, falling back to TTS', err);
        speakWithBrowser(data.greeting_text || FALLBACK_GREETING[languageCode] || FALLBACK_GREETING.en, languageCode);
      });
      return;
    }

    // 2. TTS with admin text (recorded_only means: do nothing if no MP3)
    if (data?.tts_provider === 'recorded_only') {
      console.info(`No MP3 for ${languageCode} and provider is recorded_only — skipping greeting`);
      return;
    }

    const text = data?.greeting_text || FALLBACK_GREETING[languageCode] || FALLBACK_GREETING.en;
    speakWithBrowser(text, languageCode);
  } catch (err) {
    console.warn('speakGreeting fell back to default', err);
    speakWithBrowser(FALLBACK_GREETING[languageCode] || FALLBACK_GREETING.en, languageCode);
  }
}
