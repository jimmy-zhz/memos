import { create } from "@bufbuild/protobuf";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MemoEditor from "@/components/MemoEditor";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const canAnnotate = !!parentMemoName && !!attachmentName;
  const { byPage, all, refetch } = usePdfAnnotations(parentMemoName, attachmentName);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const defaultOpenedRef = useRef(false);

  const registerPageRef = useCallback((page: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);

  // Open the comments panel by default when the PDF already has notes, so they're
  // visible on arrival instead of requiring the reader to discover the toggle button.
  // Only does this once per mount (not every time `all` changes), so it doesn't fight
  // a reader who's deliberately closed the panel.
  useEffect(() => {
    if (defaultOpenedRef.current || all.length === 0) return;
    defaultOpenedRef.current = true;
    setSidebarOpen(true);
  }, [all.length]);

  // Jumps to the page an annotation lives on. In paginated (horizontal) mode that means
  // flipping pages; in continuous scroll (vertical) mode it scrolls that page's wrapper
  // into view (sized ahead of render via basePageWidth/Height so the target is accurate
  // even if the page hasn't rendered yet — see PdfPageCanvas's `estimatedWidth/Height`).
  // Uses an instant jump rather than `behavior: "smooth"`: pages between the current
  // scroll position and the target lazy-render as the animation passes over them, and
  // each one swapping from its estimated placeholder size to its real measured size
  // mid-flight shifts the scroll target, which killed the in-progress smooth scroll
  // partway (a single click looked like it needed a second click to "finish").
  const jumpToPage = (page: number) => {
    if (state.orientation === "horizontal") {
      const target = page - ((page - 1) % Math.max(state.pagesPerView, 1));
      if (target !== state.pageNumber) {
        const diff = target - state.pageNumber;
        if (diff > 0) for (let i = 0; i < diff; i += state.pagesPerView) state.goNext();
        else for (let i = 0; i > diff; i -= state.pagesPerView) state.goPrev();
      }
      return;
    }
    pageRefs.current.get(page)?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  if (state.error) {
    return <div className={cn("w-full p-6 text-center text-sm text-destructive", className)}>{t("pdf.load-failed")}</div>;
  }

  const sidebar = (
    <PdfAnnotationSidebar
      annotations={all}
      selectedMemoName={selectedMemoName}
      onClose={() => setSidebarOpen(false)}
      onSelect={(memoName, page) => {
        setSelectedMemoName(memoName);
        jumpToPage(page);
        if (!isDesktop) setSidebarOpen(false);
      }}
    />
  );

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
          sidebarOpen={canAnnotate ? sidebarOpen : undefined}
          onToggleSidebar={canAnnotate ? () => setSidebarOpen((v) => !v) : undefined}
          textViewHref={attachmentName ? `/${attachmentName}/text` : undefined}
        />,
        toolbarSlot,
      )}
      <div className="w-full flex items-start">
        <PdfPages
          doc={state.doc}
          numPages={state.numPages}
          pageNumber={state.pageNumber}
          scale={state.scale}
          orientation={state.orientation}
          pagesPerView={state.pagesPerView}
          containerRef={state.containerRef}
          className={cn("min-w-0 flex-1", className)}
          annotationsByPage={byPage}
          selectedAnnotationMemoName={selectedMemoName}
          annotateMode={canAnnotate && annotateMode}
          onAnnotationSelect={(memoName) => {
            setSelectedMemoName(memoName);
            setSidebarOpen(true);
          }}
          onAnnotationCreate={canAnnotate ? (page, rect, text) => setPendingAnnotation({ page, rect, text }) : undefined}
          basePageWidth={state.basePageWidth}
          basePageHeight={state.basePageHeight}
          onWrapperRef={registerPageRef}
        />
        {canAnnotate && sidebarOpen && isDesktop && (
          // Sticky (not part of the page stack's own height) so it stays docked to the
          // right edge of whichever ancestor scrolls, like Adobe's comments panel, instead
          // of stretching the row or getting pushed around as notes/pages accumulate.
          // The width lives here (not on the sidebar itself): the sidebar uses w-full, and
          // a percentage width on a child of this auto-width sticky wrapper would resolve
          // circularly and blow up to content width.
          <div className="sticky top-0 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-[20%] min-w-[240px] shrink-0">{sidebar}</div>
        )}
      </div>
      {canAnnotate && !isDesktop && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="right" className="w-[85%] max-w-full overflow-y-auto px-2 py-3 bg-background">
            <SheetHeader>
              <SheetTitle>{t("pdf.annotations")}</SheetTitle>
            </SheetHeader>
            <PdfAnnotationSidebar
              className="w-full max-w-full border-l-0 border-t-0"
              annotations={all}
              selectedMemoName={selectedMemoName}
              onSelect={(memoName, page) => {
                setSelectedMemoName(memoName);
                setSidebarOpen(false);
                jumpToPage(page);
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
              onConfirm={(memoName) => {
                setPendingAnnotation(undefined);
                setSelectedMemoName(memoName);
                setSidebarOpen(true);
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
