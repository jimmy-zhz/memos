import type { ListItem, Paragraph, Root, Text } from "mdast";
import { visit } from "unist-util-visit";
import { isTaskStatusMarker, resolveTaskStatus } from "../task-status";

// `- [/] doing` and friends: GFM only consumes `[ ]` / `[x]`, so extended
// markers survive as literal text at the head of the item. Lift them out into
// a `data-task-status` property (and mark the item as a checkbox item) so they
// render as status checkboxes rather than stray brackets.
//
// Must run after remark-gfm, and before remark-split-mixed-task-lists so the
// promoted items count as task items when lists get split.

const EXTENDED_MARKER_RE = /^\[(.)\](\s+|$)/;

function firstTextNode(item: ListItem): { paragraph: Paragraph; text: Text } | undefined {
  const paragraph = item.children[0];
  if (!paragraph || paragraph.type !== "paragraph") return undefined;
  const text = paragraph.children[0];
  if (!text || text.type !== "text") return undefined;
  return { paragraph, text };
}

function setStatus(item: ListItem, marker: string) {
  const data = (item.data ??= {});
  const properties = ((data as { hProperties?: Record<string, unknown> }).hProperties ??= {});
  properties["data-task-status"] = marker;
}

export function remarkTaskStatus() {
  return (tree: Root) => {
    visit(tree, "listItem", (item: ListItem) => {
      if (typeof item.checked === "boolean") {
        // Plain GFM item — record its marker so the renderer treats every task
        // item uniformly.
        setStatus(item, item.checked ? "x" : " ");
        return;
      }

      const head = firstTextNode(item);
      if (!head) return;

      const match = EXTENDED_MARKER_RE.exec(head.text.value);
      if (!match || !isTaskStatusMarker(match[1])) return;

      head.text.value = head.text.value.slice(match[0].length);
      if (head.text.value === "" && head.paragraph.children.length > 1) {
        head.paragraph.children.shift();
      }

      const status = resolveTaskStatus(match[1]);
      // `checked` drives mdast-util-to-hast into emitting the checkbox input and
      // the task-list-item / contains-task-list classes; the real state travels
      // in data-task-status.
      item.checked = status.marker === "x";
      setStatus(item, status.marker);
    });
  };
}
