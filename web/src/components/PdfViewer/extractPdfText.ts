import type * as PdfJs from "pdfjs-dist";

// Reconstructs a markdown-ish plain-text rendering of the document from pdf.js's per-item
// text content. Each item's `hasEOL` flag marks the end of a visual line (same boundary
// pdf.js's own text layer uses), joined with single newlines; pages are joined with a blank
// line so each becomes its own paragraph once rendered through MemoMarkdownRenderer (which
// runs remark-breaks, turning the single-newline lines into hard breaks within that
// paragraph). Multi-column layouts and table alignment are not reconstructed since pdf.js
// only exposes a linear reading-order text stream.
export async function extractPdfText(doc: PdfJs.PDFDocumentProxy, numPages: number): Promise<string> {
  const pageTexts: string[] = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = "";
    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      pageText += item.str;
      if (item.hasEOL) pageText += "\n";
    }
    pageTexts.push(pageText.trim());
  }
  return pageTexts.join("\n\n");
}
