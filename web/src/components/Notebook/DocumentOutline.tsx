import { PaperclipIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import { extractHeadings } from "@/utils/markdown-manipulation";

// DOM id of the attachment list section rendered within the document's
// scrollable container (see DocumentView.tsx). Kept as a shared constant so
// the outline's "jump to attachments" link always matches the real anchor.
export const ATTACHMENTS_ANCHOR_ID = "document-attachments";

interface Props {
  content: string;
  containerRef: React.RefObject<HTMLElement | null>;
  hasAttachments?: boolean;
}

const DocumentOutline = ({ content, containerRef, hasAttachments }: Props) => {
  const t = useTranslate();
  // Uses the same mdast-based extraction as rehype-heading-id so the slug
  // computed here always matches the id assigned to the rendered heading,
  // even when the heading text contains inline markdown (links, emphasis, etc.).
  const items = useMemo(() => extractHeadings(content), [content]);

  const scrollToId = (id: string) => {
    const container = containerRef.current;
    const target = container?.querySelector(`#${CSS.escape(id)}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="w-full h-full flex flex-col">
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 text-sm">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-4">{t("notebook.no-headings")}</div>
        ) : (
          items.map((item, idx) => (
            <button
              key={`${item.slug}-${idx}`}
              className={cn("text-left truncate rounded px-2 py-1 hover:bg-accent/60 text-muted-foreground hover:text-foreground")}
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              onClick={() => scrollToId(item.slug)}
            >
              {item.text}
            </button>
          ))
        )}
      </nav>
      {hasAttachments && (
        <button
          className="shrink-0 mt-2 flex items-center gap-1.5 rounded border border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          onClick={() => scrollToId(ATTACHMENTS_ANCHOR_ID)}
        >
          <PaperclipIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t("notebook.attachments")}</span>
        </button>
      )}
    </div>
  );
};

export default DocumentOutline;
