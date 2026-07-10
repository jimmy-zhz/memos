import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";
import type { PdfAnnotationEntry } from "./usePdfAnnotations";

interface Props {
  annotations: PdfAnnotationEntry[];
  selectedMemoName?: string;
  onSelect?: (memoName: string, page: number) => void;
  className?: string;
}

// Lists every PDF annotation grouped by page, modeled after the Notebook heading
// outline (DocumentOutline.tsx) so it reads/feels the same, but for PDF notes
// instead of markdown headings. Clicking an entry drives page navigation and
// marker highlighting in the caller (PdfDocumentView); this component is pure
// display + selection.
export const PdfAnnotationSidebar = ({ annotations, selectedMemoName, onSelect, className }: Props) => {
  const t = useTranslate();

  const pages = new Map<number, PdfAnnotationEntry[]>();
  for (const entry of annotations) {
    const list = pages.get(entry.page) ?? [];
    list.push(entry);
    pages.set(entry.page, list);
  }

  return (
    <div className={cn("w-56 shrink-0 min-h-0 flex flex-col", className)}>
      <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 text-sm">
        {annotations.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-4">{t("pdf.no-annotations")}</div>
        ) : (
          Array.from(pages.entries()).map(([page, entries]) => (
            <div key={page} className="flex flex-col gap-0.5">
              <div className="px-2 text-xs font-medium text-muted-foreground">{t("pdf.page-n", { page })}</div>
              {entries.map((entry) => (
                <button
                  key={entry.memo.name}
                  className={cn(
                    "text-left truncate rounded px-2 py-1 hover:bg-accent/60",
                    entry.memo.name === selectedMemoName ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  title={entry.memo.content}
                  onClick={() => onSelect?.(entry.memo.name, entry.page)}
                >
                  {entry.memo.content || entry.memo.snippet}
                </button>
              ))}
            </div>
          ))
        )}
      </nav>
    </div>
  );
};
