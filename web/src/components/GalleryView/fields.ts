import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import { type MemoProperty, parseFrontmatter } from "@/utils/frontmatter";
import type { GalleryCardField, GalleryGroup, GalleryRule, GalleryScope } from "./types";

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
export function propertyValueToString(prop: MemoProperty): string {
  if (prop.type === "list") return Array.isArray(prop.value) ? prop.value.join(", ") : "";
  if (prop.value === null) return "";
  return String(prop.value);
}

/** Context needed to evaluate a `folder` rule's default path. */
export interface RuleContext {
  /** The VIEW document's own folder, used when a folder rule omits `path`. */
  viewFolderPath: string;
}

function matchesFolderRule(doc: Memo, rule: Extract<GalleryRule, { kind: "folder" }>, ctx: RuleContext): boolean {
  const basePath = (rule.path?.trim() || ctx.viewFolderPath).replace(/^\/+|\/+$/g, "");
  const includeSubfolders = rule.includeSubfolders !== false;
  if (basePath === "") return includeSubfolders || doc.folderPath === "";
  return doc.folderPath === basePath || (includeSubfolders && doc.folderPath.startsWith(`${basePath}/`));
}

function matchesPropertyRule(props: Map<string, MemoProperty>, rule: Extract<GalleryRule, { kind: "property" }>): boolean {
  if (!rule.key) return false;
  const prop = props.get(rule.key);
  if (!prop) return false;
  if (prop.type === "list") {
    return Array.isArray(prop.value) && prop.value.some((item) => item === rule.value);
  }
  return propertyValueToString(prop) === rule.value;
}

function matchesRule(doc: Memo, props: Map<string, MemoProperty>, rule: GalleryRule, ctx: RuleContext): boolean {
  if (rule.kind === "folder") return matchesFolderRule(doc, rule, ctx);
  if (rule.kind === "tag") return doc.tags.includes(rule.tag);
  return matchesPropertyRule(props, rule);
}

function matchesGroup(doc: Memo, props: Map<string, MemoProperty>, group: GalleryGroup, ctx: RuleContext): boolean {
  if (group.rules.length === 0) return true;
  return group.match === "any" ? group.rules.some((r) => matchesRule(doc, props, r, ctx)) : group.rules.every((r) => matchesRule(doc, props, r, ctx));
}

// True when a document falls within a gallery block's scope: each group is
// evaluated (AND/OR across its rules), then groups are combined the same way.
export function matchesScope(doc: Memo, props: Map<string, MemoProperty>, scope: GalleryScope, ctx: RuleContext): boolean {
  if (scope.groups.length === 0) return true;
  return scope.match === "any"
    ? scope.groups.some((g) => matchesGroup(doc, props, g, ctx))
    : scope.groups.every((g) => matchesGroup(doc, props, g, ctx));
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
