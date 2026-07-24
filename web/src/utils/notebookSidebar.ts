const STORAGE_KEY = "memos-notebook-sidebar-collapsed";

const listeners = new Set<() => void>();

const getStoredCollapsed = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

// The user's persisted preference (survives reloads), and a transient per-document override
// that wins while set. The override lets a document opt out of the folder tree (frontmatter
// `displayFilter: false`) without touching the saved preference — and, crucially, the effective
// value below is the single source of truth the toggle button reads, so one click always flips
// what's actually on screen (no stale-state double-click).
let manualCollapsed: boolean = getStoredCollapsed();
let override: boolean | null = null;

const getEffectiveCollapsed = (): boolean => (override !== null ? override : manualCollapsed);

export const getNotebookSidebarCollapsed = (): boolean => getEffectiveCollapsed();

export const setNotebookSidebarCollapsed = (collapsed: boolean): void => {
  manualCollapsed = collapsed;
  // An explicit user choice clears any per-document override and becomes the new saved preference.
  override = null;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // localStorage might not be available (SSR, private browsing, etc.)
  }
  listeners.forEach((listener) => listener());
};

export const toggleNotebookSidebarCollapsed = (): void => {
  // Toggle relative to what's actually shown, so a document-forced collapse reveals in one click.
  setNotebookSidebarCollapsed(!getEffectiveCollapsed());
};

// Per-document default (not persisted). Pass `true`/`false` to force collapsed/expanded while a
// document is open, or `null` to defer to the user's saved preference. Cleared when leaving the
// notebook so it never bleeds into the rest of the app.
export const setNotebookSidebarOverride = (value: boolean | null): void => {
  if (override === value) return;
  override = value;
  listeners.forEach((listener) => listener());
};

export const subscribeNotebookSidebarCollapsed = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
