import { create } from "@bufbuild/protobuf";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { MemoMarkdownRenderer } from "@/components/MemoContent/MemoMarkdownRenderer";
import { aiServiceClient } from "@/connect";
import { FormatMarkdownRequestSchema } from "@/types/proto/api/v1/ai_service_pb";
import { attachmentNamePrefix } from "@/helpers/resource-names";
import { useAttachment } from "@/hooks/useAttachmentQueries";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";

const NO_MENTIONS = new Set<string>();

// Bare page (no sidebar/app chrome) opened in a new tab to show a PDF attachment's text
// content rendered through the same markdown pipeline as a regular memo — not the canvas
// image the main viewer renders, which has no real DOM text for the browser's translate
// feature to read. This never creates a persisted memo; the extracted text lives only in
// this page's state.
const AttachmentTextPreview = () => {
  const t = useTranslate();
  const params = useParams();
  const [content, setContent] = useState<string | null>(null);
  const [extractError, setExtractError] = useState(false);
  const [formatting, setFormatting] = useState(false);

  const name = params.uid ? `${attachmentNamePrefix}${params.uid}` : "";
  const { data: attachment, isLoading, error } = useAttachment(name, { enabled: !!name });

  useEffect(() => {
    if (!attachment) return;
    document.title = attachment.filename;
  }, [attachment]);

  useEffect(() => {
    if (!attachment) return;
    let cancelled = false;
    (async () => {
      try {
        const { getCachedFormattedMarkdown, setCachedFormattedMarkdown } = await import("@/utils/formattedMarkdownCache");
        const cached = params.uid ? getCachedFormattedMarkdown(params.uid) : null;
        if (cached !== null) {
          if (!cancelled) setContent(cached);
          return;
        }
        const { withChunkReload } = await import("@/utils/dynamicImport");
        const pdfjs = await withChunkReload(() => import("pdfjs-dist"));
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const response = await fetch(getAttachmentUrl(attachment));
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const data = await response.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        const { extractPdfText } = await import("@/components/PdfViewer/extractPdfText");
        const extracted = await extractPdfText(doc, doc.numPages);
        doc.destroy();
        if (cancelled) return;
        // Ask the instance AI provider to restructure the raw extracted text into
        // markdown (content preserved verbatim). Falls back to the raw text when AI
        // is not configured or the call fails.
        setFormatting(true);
        let finalContent = extracted;
        try {
          const response = await aiServiceClient.formatMarkdown(
            create(FormatMarkdownRequestSchema, { text: extracted, filename: attachment.filename }),
          );
          if (response.markdown.trim() !== "") {
            finalContent = response.markdown;
            if (params.uid) setCachedFormattedMarkdown(params.uid, response.markdown);
          }
        } catch {
          // Keep the raw extracted text.
        }
        if (!cancelled) {
          setFormatting(false);
          setContent(finalContent);
        }
      } catch {
        if (!cancelled) setExtractError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment]);

  if (isLoading) {
    return <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">{t("pdf.loading")}</div>;
  }

  if (error || !attachment) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-destructive">
        {t("attachment-preview.unavailable")}
      </div>
    );
  }

  return (
    <div className="mx-auto h-screen w-screen max-w-3xl overflow-y-auto px-6 py-8">
      <h1 className="mb-4 text-lg font-medium text-foreground">{attachment.filename}</h1>
      {extractError ? (
        <p className="text-sm text-destructive">{t("pdf.load-failed")}</p>
      ) : content === null ? (
        <p className="text-sm text-muted-foreground">{formatting ? t("attachment-preview.ai-formatting") : t("pdf.loading")}</p>
      ) : (
        <div className="text-base leading-6 text-foreground">
          <MemoMarkdownRenderer content={content} resolvedMentionUsernames={NO_MENTIONS} />
        </div>
      )}
    </div>
  );
};

export default AttachmentTextPreview;
