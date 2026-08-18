// Tags that are spoken by the GLOBAL system recordings (Recording 1 greeting,
// Recording 2 IVR menu). These must NOT be reused inside per-campaign scripts
// or the same value would be spoken twice.
export const RESERVED_SYSTEM_TAGS = ["client_name"] as const;

export const isReservedSystemTag = (key: string) =>
  (RESERVED_SYSTEM_TAGS as readonly string[]).includes(key);

export const findReservedTagsInScript = (script: string): string[] => {
  if (!script) return [];
  const found = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    if (isReservedSystemTag(m[1])) found.add(m[1]);
  }
  return [...found];
};
