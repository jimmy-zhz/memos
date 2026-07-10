import { create } from "@bufbuild/protobuf";
import { ListIcon } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import MemoEditor from "@/components/MemoEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import useMediaQuery from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { PdfAnnotationSchema } from "@/types/proto/api/v1/memo_service_pb";
import { useTranslate } from "@/utils/i18n";
import type { PdfAnnotationRect } from "./PdfAnnotationLayer";
import { PdfAnnotationSidebar } from "./PdfAnnotationSidebar";
import { PdfPages } from "./PdfPages";
import { PdfToolbar } from "./PdfToolbar";
import { usePdfAnnotations } from "./usePdfAnnotations";
import { usePdfViewerState } from "./usePdfViewerState";

interface Props {
  url: string;
  /** DOM node (typically a slot in a parent title bar) the toolbar is portaled into. */
  toolbarSlot: HTMLElement;
  className?: string;
  /** The memo this PDF is attached to. Annotation comments are anchored to it. Omit to disable annotations (e.g. no memo context available). */
  parentMemoName?: string;
  /** The attachment's resource name (attachments/{uid}), used to anchor annotations to this specific file. */
  attachmentName?: string;
}

// Splits the PDF viewer into a toolbar (portaled into a caller-provided slot, e.g. a
// document title bar) and a pages area rendered inline — used by DocumentView so the
// page/zoom/orientation controls can sit next to the title instead of above the content.
export const PdfDocumentView = ({ url, toolbarSlot, className, parentMemoName, attachmentName }: Props) => {
  const t = useTranslate();
  const state = usePdfViewerState(url);
  const isDesktop = useMediaQuery("lg");
  const [annotateMode, setAnnotateMode] = useState(false);
  const [selectedMemoName, setSelectedMemoName] = useState<string>();
  const [pendingAnnotation, setPendingAnnotation] = useState<{ page: number; rect: PdfAnnotationRect; text: string }>();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const canAnnotate = !!parentMemoName && !!attachmentName;
  const { byPage, all, refetch } = usePdfAnnotations(parentMemoName, attachmentName);

  if (state.error) {
    return <div className={cn("w-full p-6 text-center text-sm text-destructive", className)}>{t("pdf.load-failed")}</div>;
  }

  return (
    <>
      {createPortal(
        <PdfToolbar
          orientation={state.orientation}
          pageNumber={state.pageNumber}
          numPages={state.numPages}
          pagesPerView={state.pagesPerView}
          scale={state.scale}
          loading={state.loading}
          canGoPrev={state.canGoPrev}
          canGoNext={state.canGoNext}
          canZoomOut={state.canZoomOut}
          canZoomIn={state.canZoomIn}
          onToggleOrientation={state.toggleOrientation}
          onPrev={state.goPrev}
          onNext={state.goNext}
          onZoomOut={state.zoomOut}
          onZoomIn={state.zoomIn}
          annotateMode={canAnnotate ? annotateMode : undefined}
          onToggleAnnotateMode={canAnnotate ? () => setAnnotateMode((v) => !v) : undefined}
        />,
        toolbarSlot,
      )}
      {canAnnotate &&
        all.length > 0 &&
        !isDesktop &&
        createPortal(
          <Button variant="ghost" size="icon" onClick={() => setMobileSidebarOpen(true)} title={t("pdf.annotations")}>
            <ListIcon className="w-4 h-4" />
          </Button>,
          toolbarSlot,
        )}
      <div className="w-full flex items-start gap-2">
        <PdfPages
          doc={state.doc}
          numPages={state.numPages}
          pageNumber={state.pageNumber}
          scale={state.scale}
          orientation={state.orientation}
          pagesPerView={state.pagesPerView}
          containerRef={state.containerRef}
          className={className}
          annotationsByPage={byPage}
          selectedAnnotationMemoName={selectedMemoName}
          annotateMode={canAnnotate && annotateMode}
          onAnnotationSelect={setSelectedMemoName}
          onAnnotationCreate={canAnnotate ? (page, rect, text) => setPendingAnnotation({ page, rect, text }) : undefined}
        />
        {canAnnotate && all.length > 0 && isDesktop && (
          <PdfAnnotationSidebar
            annotations={all}
            selectedMemoName={selectedMemoName}
            onSelect={(memoName, page) => {
              setSelectedMemoName(memoName);
              if (state.orientation === "horizontal") {
                const target = page - ((page - 1) % Math.max(state.pagesPerView, 1));
                if (target !== state.pageNumber) {
                  const diff = target - state.pageNumber;
                  if (diff > 0) for (let i = 0; i < diff; i += state.pagesPerView) state.goNext();
                  else for (let i = 0; i > diff; i -= state.pagesPerView) state.goPrev();
                }
              }
            }}
          />
        )}
      </div>
      {canAnnotate && all.length > 0 && !isDesktop && (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="right" className="w-[85%] max-w-full overflow-y-auto px-2 py-3 bg-background">
            <SheetHeader>
              <SheetTitle>{t("pdf.annotations")}</SheetTitle>
            </SheetHeader>
            <PdfAnnotationSidebar
              className="w-full"
              annotations={all}
              selectedMemoName={selectedMemoName}
              onSelect={(memoName, page) => {
                setSelectedMemoName(memoName);
                setMobileSidebarOpen(false);
                if (state.orientation === "horizontal") {
                  const target = page - ((page - 1) % Math.max(state.pagesPerView, 1));
                  if (target !== state.pageNumber) {
                    const diff = target - state.pageNumber;
                    if (diff > 0) for (let i = 0; i < diff; i += state.pagesPerView) state.goNext();
                    else for (let i = 0; i > diff; i -= state.pagesPerView) state.goPrev();
                  }
                }
              }}
            />
          </SheetContent>
        </Sheet>
      )}
      {pendingAnnotation && parentMemoName && attachmentName && (
        <Dialog open onOpenChange={(open) => !open && setPendingAnnotation(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("pdf.add-annotation")}</DialogTitle>
            </DialogHeader>
            <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground line-clamp-4">
              {pendingAnnotation.text}
            </blockquote>
            <MemoEditor
              autoFocus
              parentMemoName={parentMemoName}
              pdfAnnotation={create(PdfAnnotationSchema, {
                attachmentName,
                page: pendingAnnotation.page,
                x: pendingAnnotation.rect.x,
                y: pendingAnnotation.rect.y,
                width: pendingAnnotation.rect.width,
                height: pendingAnnotation.rect.height,
                textSnippet: pendingAnnotation.text,
              })}
              onConfirm={() => {
                setPendingAnnotation(undefined);
                refetch();
              }}
              onCancel={() => setPendingAnnotation(undefined)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
