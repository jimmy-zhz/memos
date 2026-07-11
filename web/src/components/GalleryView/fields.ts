import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { type MemoProperty, parseFrontmatter } from "@/utils/frontmatter";
import type { GalleryCardField, GalleryPropertyFilter } from "./types";

// Builds a key -> property lookup from a document's frontmatter. Keys are
// compared case-sensitively, matching how the properties panel displays them.
export function propertyMap(content: string): Map<string, MemoProperty> {
  const map = new Map<string, MemoProperty>();
  for (const prop of parseFrontmatter(content).properties) {
    map.set(prop.key, prop);
  }
  return map;
}

// Renders a property's value to a plain string for display / equality checks.
function propertyValueToString(prop: MemoProperty): string {
  if (prop.type === "list") return Array.isArray(prop.value) ? prop.value.join(", ") : "";
  if (prop.value === null) return "";
  return String(prop.value);
}

// True when the document satisfies every property filter (equality only). List
// properties match when any item equals the target value.
export function matchesPropertyFilters(props: Map<string, MemoProperty>, filters: GalleryPropertyFilter[]): boolean {
  return filters.every((filter) => {
    const prop = props.get(filter.key);
    if (!prop) return false;
    if (prop.type === "list") {
      return Array.isArray(prop.value) && prop.value.some((item) => item === filter.value);
    }
    return propertyValueToString(prop) === filter.value;
  });
}

// Resolves a card field token to its display string for a given document.
export function fieldValue(memo: Memo, props: Map<string, MemoProperty>, field: GalleryCardField): string {
  if (!field) return "";
  if (field === "__title__") return memo.title || memo.name;
  if (field === "__updated__") {
    return memo.updateTime ? new Date(Number(memo.updateTime.seconds) * 1000).toLocaleDateString() : "";
  }
  if (field === "__created__") {
    return memo.createTime ? new Date(Number(memo.createTime.seconds) * 1000).toLocaleDateString() : "";
  }
  if (field.startsWith("prop:")) {
    const prop = props.get(field.slice(5));
    return prop ? propertyValueToString(prop) : "";
  }
  return "";
}
