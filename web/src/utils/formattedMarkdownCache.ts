const CACHE_KEY_PREFIX = "attachment-formatted-md:";
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 3 months

interface CacheEntry {
  savedAt: number;
  markdown: string;
}

// localStorage cache for AI-formatted attachment markdown, so re-opening the plain-text
// preview does not re-run the (slow, billable) LLM formatting call. Entries expire after
// 3 months; expired or malformed entries are dropped on read, and a quota failure on
// write prunes expired entries once before giving up silently (the cache is best-effort).
export function getCachedFormattedMarkdown(attachmentUid: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + attachmentUid);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (typeof entry.markdown !== "string" || typeof entry.savedAt !== "number" || Date.now() - entry.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + attachmentUid);
      return null;
    }
    return entry.markdown;
  } catch {
    return null;
  }
}

export function setCachedFormattedMarkdown(attachmentUid: string, markdown: string): void {
  const entry: CacheEntry = { savedAt: Date.now(), markdown };
  const write = () => localStorage.setItem(CACHE_KEY_PREFIX + attachmentUid, JSON.stringify(entry));
  try {
    write();
  } catch {
    try {
      pruneExpiredEntries();
      write();
    } catch {
      // Best-effort: the document may simply be too large for localStorage.
    }
  }
}

function pruneExpiredEntries(): void {
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(CACHE_KEY_PREFIX)) continue;
    try {
      const entry: CacheEntry = JSON.parse(localStorage.getItem(key) ?? "");
      if (typeof entry.savedAt !== "number" || now - entry.savedAt > CACHE_TTL_MS) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
}
