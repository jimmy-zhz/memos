// Structured configuration stored as the content of a VIEW document.
// The content holds ONLY this JSON (plus optional markdown intro fields inside
// it) — never HTML or rendered output. Every view block is rendered live from
// current data each time the document is opened.
//
// A single VIEW document may hold multiple gallery blocks (each with its own
// intro, scope, sort, cover and card fields), rendered top-to-bottom separated
// by dividers.

/**
 * An equality condition on a document's frontmatter property. A document passes
 * when it has a property named `key` whose value equals `value` (for list
 * properties, when any item equals `value`). Only equality is supported.
 */
export interface GalleryPropertyFilter {
  key: string;
  value: string;
}

// Which documents a gallery block shows. Exactly one of three mutually
// exclusive modes: the view doc's own folder, a tag, or a set of property
// equality conditions (ANDed together).
export type GalleryScope = { type: "folder" } | { type: "tag"; tag: string } | { type: "property"; filters: GalleryPropertyFilter[] };

export type GallerySort = "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "title_asc";

export type GalleryCoverRule = "first_image" | "none";

/**
 * A field shown on a gallery card. Built-in tokens cover the document's own
 * metadata; `prop:<key>` pulls a frontmatter property value. Empty string means
 * "show nothing" for that row.
 */
export type GalleryCardField = "__title__" | "__updated__" | "__created__" | "" | (string & {});

export interface GalleryCardFields {
  /** First (bold) row. Defaults to the document title. */
  primary: GalleryCardField;
  /** Second (muted) row. Defaults to the update date. */
  secondary: GalleryCardField;
}

/** A single gallery within a VIEW document. */
export interface GalleryBlock {
  /** Optional markdown intro rendered above this block's cards. */
  description?: string;
  scope: GalleryScope;
  sort: GallerySort;
  cover: GalleryCoverRule;
  cardFields: GalleryCardFields;
}

export interface GalleryViewConfig {
  viewType: "gallery";
  blocks: GalleryBlock[];
}

export const DEFAULT_CARD_FIELDS: GalleryCardFields = {
  primary: "__title__",
  secondary: "__updated__",
};

export const DEFAULT_GALLERY_BLOCK: GalleryBlock = {
  scope: { type: "folder" },
  sort: "updated_desc",
  cover: "first_image",
  cardFields: DEFAULT_CARD_FIELDS,
};

function parsePropertyFilters(raw: unknown): GalleryPropertyFilter[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f: unknown): f is { key: unknown; value: unknown } => !!f && typeof f === "object")
    .map((f: { key: unknown; value: unknown }) => ({ key: String(f.key ?? "").trim(), value: String(f.value ?? "") }))
    .filter((f: GalleryPropertyFilter) => f.key !== "");
}

function parseScope(raw: unknown): GalleryScope {
  if (raw && typeof raw === "object") {
    const scope = raw as { type?: unknown; tag?: unknown; filters?: unknown };
    if (scope.type === "tag" && typeof scope.tag === "string") return { type: "tag", tag: scope.tag };
    if (scope.type === "property") return { type: "property", filters: parsePropertyFilters(scope.filters) };
  }
  return { type: "folder" };
}

const CARD_FIELD_TOKENS = new Set(["__title__", "__updated__", "__created__"]);

// Sanitize a stored card field: keep known tokens, empty string, or a
// `prop:<key>` reference; fall back to empty otherwise.
function normalizeCardField(raw: unknown, fallback: GalleryCardField): GalleryCardField {
  if (raw === "") return "";
  if (typeof raw !== "string") return fallback;
  if (CARD_FIELD_TOKENS.has(raw) || raw.startsWith("prop:")) return raw;
  return fallback;
}

const SORTS: GallerySort[] = ["updated_desc", "updated_asc", "created_desc", "created_asc", "title_asc"];

function parseBlock(raw: unknown): GalleryBlock {
  const b = (raw ?? {}) as {
    description?: unknown;
    scope?: unknown;
    sort?: unknown;
    cover?: unknown;
    cardFields?: { primary?: unknown; secondary?: unknown };
  };
  return {
    description: typeof b.description === "string" && b.description.trim() ? b.description : undefined,
    scope: parseScope(b.scope),
    sort: SORTS.includes(b.sort as GallerySort) ? (b.sort as GallerySort) : DEFAULT_GALLERY_BLOCK.sort,
    cover: b.cover === "none" ? "none" : "first_image",
    cardFields: {
      primary: normalizeCardField(b.cardFields?.primary, DEFAULT_CARD_FIELDS.primary),
      secondary: normalizeCardField(b.cardFields?.secondary, DEFAULT_CARD_FIELDS.secondary),
    },
  };
}

/**
 * Parses a VIEW document's content into gallery blocks. Returns undefined when
 * the content isn't a gallery view at all (empty/invalid), so the editor can
 * show its empty state. Legacy single-block documents (config fields at the top
 * level, no `blocks` array) are migrated into a one-element block list.
 */
export function parseGalleryViewConfig(content: string): GalleryViewConfig | undefined {
  if (!content.trim()) return undefined;
  try {
    const raw = JSON.parse(content);
    if (!raw || typeof raw !== "object" || raw.viewType !== "gallery") return undefined;
    if (Array.isArray(raw.blocks)) {
      return { viewType: "gallery", blocks: raw.blocks.map(parseBlock) };
    }
    // Legacy single-config shape: treat the whole object as one block.
    return { viewType: "gallery", blocks: [parseBlock(raw)] };
  } catch {
    return undefined;
  }
}

export function serializeGalleryViewConfig(config: GalleryViewConfig): string {
  return JSON.stringify(config, null, 2);
}
