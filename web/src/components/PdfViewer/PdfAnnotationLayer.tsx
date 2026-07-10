import { cn } from "@/lib/utils";
import type { PdfAnnotationEntry } from "./usePdfAnnotations";

export interface PdfAnnotationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  annotations: PdfAnnotationEntry[];
  selectedMemoName?: string;
  onSelect?: (memoName: string) => void;
}

// Overlays markers for existing PDF annotations on top of a rendered page (highlight boxes
// over the text they were written about). Geometry is page-normalized (0~1) fractions, so
// markers stay aligned across zoom/orientation changes via plain CSS percentages — no
// pixel/viewport math needed. Creating a new annotation happens by selecting text in the
// page's text layer (see PdfPageCanvas), not by interacting with this layer, so it never
// captures pointer events itself — only the marker buttons it renders are clickable.
export const PdfAnnotationLayer = ({ annotations, selectedMemoName, onSelect }: Props) => {
  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
      {annotations.map((annotation) => {
        const isSelected = annotation.memo.name === selectedMemoName;
        return (
          <button
            key={annotation.memo.name}
            type="button"
            className={cn(
              "absolute pointer-events-auto rounded-sm border-2 transition-colors",
              isSelected ? "border-primary bg-primary/20" : "border-yellow-500/70 bg-yellow-400/20 hover:bg-yellow-400/30",
            )}
            style={{
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              width: `${annotation.width * 100}%`,
              height: `${annotation.height * 100}%`,
            }}
            title={annotation.memo.content}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(annotation.memo.name);
            }}
          />
        );
      })}
    </div>
  );
};
