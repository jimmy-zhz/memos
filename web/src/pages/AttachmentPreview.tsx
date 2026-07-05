import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PdfDocumentView } from "@/components/PdfViewer/PdfDocumentView";
import { attachmentNamePrefix } from "@/helpers/resource-names";
import { useAttachment } from "@/hooks/useAttachmentQueries";
import { isHtmlAttachment, isPdfAttachment } from "@/components/MemoMetadata/Attachment/attachmentHelpers";
import { getAttachmentUrl } from "@/utils/attachment";
import { useTranslate } from "@/utils/i18n";

// Standalone, unauthenticated-chrome page opened in a new tab to preview a PDF or
// HTML attachment without forcing a download. HTML is rendered in a sandboxed
// iframe (no allow-scripts) so uploaded HTML can never execute in the app origin.
const AttachmentPreview = () => {
  const t = useTranslate();
  const params = useParams();
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const toolbarSlotRef = useCallback((node: HTMLDivElement | null) => setToolbarSlot(node), []);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [htmlError, setHtmlError] = useState(false);

  const name = params.uid ? `${attachmentNamePrefix}${params.uid}` : "";
  const { data: attachment, isLoading, error } = useAttachment(name, { enabled: !!name });

  const isHtml = attachment ? isHtmlAttachment(attachment) : false;
  const isPdf = attachment ? isPdfAttachment(attachment) : false;

  useEffect(() => {
    if (!attachment || !isHtml) {
      return;
    }
    let cancelled = false;
    fetch(getAttachmentUrl(attachment))
      .then((res) => {
        if (!res.ok) throw new Error("failed to fetch attachment");
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setHtmlContent(text);
      })
      .catch(() => {
        if (!cancelled) setHtmlError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment, isHtml]);

  if (isLoading) {
    return <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">{t("pdf.loading")}</div>;
  }

  if (error || !attachment || (!isPdf && !isHtml)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-destructive">{t("attachment-preview.unavailable")}</div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="truncate text-sm font-medium text-foreground" title={attachment.filename}>
          {attachment.filename}
        </span>
        <div ref={toolbarSlotRef} className="flex shrink-0 items-center gap-1" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPdf && toolbarSlot && <PdfDocumentView url={getAttachmentUrl(attachment)} toolbarSlot={toolbarSlot} className="px-6 py-4" />}
        {isHtml &&
          (htmlError ? (
            <div className="flex h-full items-center justify-center text-sm text-destructive">{t("attachment-preview.unavailable")}</div>
          ) : (
            <iframe
              title={attachment.filename}
              srcDoc={htmlContent ?? ""}
              sandbox="allow-same-origin"
              className="h-full w-full border-0"
            />
          ))}
      </div>
    </div>
  );
};

export default AttachmentPreview;
