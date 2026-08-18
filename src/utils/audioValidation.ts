// Shared client-side validation for admin-uploaded language audio.
// Constraints removed — accepts any audio file (MP3, WAV, OGG, M4A, etc.).

export interface AudioConstraints {
  maxSizeMB?: number;
  maxDurationSec?: number;
  minDurationSec?: number;
}

export async function validateAudioFile(
  file: File,
  _c: AudioConstraints = {},
): Promise<string | null> {
  if (file.size === 0) {
    return 'File is empty (0 bytes). Please choose a valid audio file.';
  }
  return null;
}
