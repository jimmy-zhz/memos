import { useEffect, useRef, useState } from "react";
import { usePdfDocument } from "./usePdfDocument";

export type PdfOrientation = "vertical" | "horizontal";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
// Landscape mode shows 2 pages side by side as long as the container can fit at least
// 1.5 page-widths; below that, a second page would be mostly clipped, so fall back to 1.
const TWO_PAGE_WIDTH_FACTOR = 1.5;

export function usePdfViewerState(url: string) {
  const { docRef, numPages, loading, error } = usePdfDocument(url);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [orientation, setOrientation] = useState<PdfOrientation>("horizontal");
  const [basePageWidth, setBasePageWidth] = useState(0); // page width in CSS px at scale=1
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has manually picked an orientation, so the auto-detection below
  // (landscape pages -> scroll mode, portrait pages -> paginated mode) doesn't override their choice.
  const orientationTouchedRef = useRef(false);

  useEffect(() => {
    setPageNumber(1);
    orientationTouchedRef.current = false;
  }, [url]);

  useEffect(() => {
    if (loading || numPages === 0 || !docRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await docRef.current?.getPage(1);
      if (cancelled || !page) return;
      const viewport = page.getViewport({ scale: 1 });
      setBasePageWidth(viewport.width);
      if (!orientationTouchedRef.current) {
        setOrientation(viewport.width > viewport.height ? "vertical" : "horizontal");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, numPages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pagesPerView =
    orientation === "horizontal" && basePageWidth > 0 && containerWidth >= basePageWidth * scale * TWO_PAGE_WIDTH_FACTOR ? 2 : 1;

  const goPrev = () => setPageNumber((p) => Math.max(1, p - pagesPerView));
  const goNext = () => setPageNumber((p) => Math.min(numPages, p + Math.max(pagesPerView, 1)));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const toggleOrientation = () => setOrientation((o) => (o === "vertical" ? "horizontal" : "vertical"));

  return {
    doc: docRef.current,
    numPages,
    loading,
    error,
    pageNumber,
    scale,
    orientation,
    pagesPerView,
    containerRef,
    goPrev,
    goNext,
    zoomOut,
    zoomIn,
    toggleOrientation,
    canGoPrev: pageNumber > 1,
    canGoNext: pageNumber + pagesPerView <= numPages,
    canZoomOut: scale > MIN_SCALE,
    canZoomIn: scale < MAX_SCALE,
  };
}
