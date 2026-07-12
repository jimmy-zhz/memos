import type { Root, Text } from "mdast";
import type { Node as UnistNode } from "unist";

// Obsidian-style highlight syntax: `==text==` for a yellow background,
// `===text===` (this project's own extension, not part of Obsidian) for pink.
// Delimiters must be immediately followed/preceded by non-`=` content — an
// empty pair (`====`) or a run of bare `=` characters never opens a highlight.

type Segment = { type: "text"; value: string } | { type: "highlight"; color: "yellow" | "pink"; value: string };

/**
 * Scan left to right. At each position, try the longer `===...===` delimiter
 * first so `===text===` isn't misread as `=` + `==text==` + `=`; only fall
 * back to `==...==` when no matching triple-equals close exists.
 */
function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) {
      segments.push({ type: "text", value: text.slice(textStart, end) });
    }
  };

  while (i < text.length) {
    if (text[i] !== "=") {
      i++;
      continue;
    }

    // A run boundary: not preceded by another `=` (otherwise this position is
    // the middle of a longer `====` run, not a real delimiter start).
    const atRunStart = i === 0 || text[i - 1] !== "=";

    const tripleOpen = atRunStart && text.startsWith("===", i) && text[i + 3] !== "=";
    if (tripleOpen) {
      const close = text.indexOf("===", i + 3);
      // The close must not be followed by another `=` (part of a longer
      // closing run, e.g. `===text====`).
      if (close > i + 3 && text[close + 3] !== "=") {
        flushText(i);
        segments.push({ type: "highlight", color: "pink", value: text.slice(i + 3, close) });
        i = close + 3;
        textStart = i;
        continue;
      }
    }

    const doubleOpen = atRunStart && text.startsWith("==", i) && text[i + 2] !== "=";
    if (doubleOpen) {
      const close = text.indexOf("==", i + 2);
      if (close > i + 2 && text[close + 2] !== "=") {
        flushText(i);
        segments.push({ type: "highlight", color: "yellow", value: text.slice(i + 2, close) });
        i = close + 2;
        textStart = i;
        continue;
      }
    }

    i++;
  }

  flushText(text.length);
  return segments;
}

function createHighlightNode(color: "yellow" | "pink", value: string) {
  return {
    type: "highlightNode",
    value,
    data: {
      hName: "mark",
      hProperties: { className: `highlight highlight-${color}` },
      hChildren: [{ type: "text", value }],
    },
  } as unknown as Text;
}

type ParentNode = UnistNode & { children: UnistNode[] };

function isParentNode(node: UnistNode): node is ParentNode {
  return Array.isArray((node as { children?: unknown }).children);
}

function transformHighlightTextNodes(parent: ParentNode): void {
  for (let index = 0; index < parent.children.length; index++) {
    const child = parent.children[index];

    if (child.type === "text") {
      const textNode = child as Text;
      const segments = parseSegments(textNode.value);

      if (segments.every((seg) => seg.type === "text")) {
        continue;
      }

      const newNodes = segments.map((segment) =>
        segment.type === "highlight" ? createHighlightNode(segment.color, segment.value) : ({ type: "text", value: segment.value } as Text),
      );

      parent.children.splice(index, 1, ...(newNodes as UnistNode[]));
      index += newNodes.length - 1;
      continue;
    }

    if (isParentNode(child)) {
      transformHighlightTextNodes(child);
    }
  }
}

export const remarkHighlight = () => {
  return (tree: Root) => {
    transformHighlightTextNodes(tree as unknown as ParentNode);
  };
};
