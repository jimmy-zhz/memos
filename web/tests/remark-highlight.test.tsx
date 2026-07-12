import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { remarkHighlight } from "@/utils/remark-plugins/remark-highlight";

const renderMarkdown = (content: string): string =>
  renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkHighlight]}>{content}</ReactMarkdown>,
  );

describe("remarkHighlight", () => {
  it("renders ==text== as a yellow mark", () => {
    const html = renderMarkdown("plain ==yellow== text");

    expect(html).toContain('<mark class="highlight highlight-yellow">yellow</mark>');
  });

  it("renders ===text=== as a pink mark", () => {
    const html = renderMarkdown("plain ===pink=== text");

    expect(html).toContain('<mark class="highlight highlight-pink">pink</mark>');
  });

  it("handles adjacent pairs on the same line", () => {
    const html = renderMarkdown("==a==b==c==");

    expect(html).toContain('<mark class="highlight highlight-yellow">a</mark>b<mark class="highlight highlight-yellow">c</mark>');
  });

  it("does not treat a bare run of = or an empty pair as a highlight", () => {
    const html = renderMarkdown("==== and === alone");

    expect(html).not.toContain("<mark");
    expect(html).toContain("====");
  });

  it("does not highlight inside inline code", () => {
    const html = renderMarkdown("`code ==x==`");

    expect(html).not.toContain("<mark");
    expect(html).toContain("==x==");
  });
});
