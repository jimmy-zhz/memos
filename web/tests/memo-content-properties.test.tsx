import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoMarkdownRenderer } from "@/components/MemoContent/MemoMarkdownRenderer";

const render = (content: string): string =>
  renderToStaticMarkup(<MemoMarkdownRenderer content={content} resolvedMentionUsernames={new Set<string>()} />);

describe("memo content properties", () => {
  it("renders leading frontmatter as a properties panel and strips it from the body", () => {
    const html = render(
      ["---", "title: AI Ethics Week 1", "teacher: Dr. Smith", "date: 2026-07-11", "---", "", "# Body heading", "text"].join("\n"),
    );

    // Panel is present with the property keys and values.
    expect(html).toContain("data-memo-properties");
    expect(html).toContain("AI Ethics Week 1");
    expect(html).toContain("teacher");

    // Body still renders after the block...
    expect(html).toContain("Body heading");
    // ...but the raw `---` fence never leaks into the markdown output as an <hr>.
    expect(html).not.toContain("<hr");
  });

  it("ignores a `---` block that is not at the very first line (Obsidian requires line 1)", () => {
    const html = render(["# Title first", "---", "title: Nope", "---", "", "body"].join("\n"));

    // No properties panel: the block is plain markdown, not frontmatter.
    expect(html).not.toContain("data-memo-properties");
    // It renders as a normal thematic break instead.
    expect(html).toContain("<hr");
  });
});
