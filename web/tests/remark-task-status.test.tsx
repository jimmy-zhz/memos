import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { remarkTaskStatus } from "@/utils/remark-plugins/remark-task-status";

const renderMarkdown = (content: string): string =>
  renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm, remarkTaskStatus]}>{content}</ReactMarkdown>);

describe("remarkTaskStatus", () => {
  it("promotes extended markers to task list items and strips the literal brackets", () => {
    const html = renderMarkdown("- [/] doing");

    expect(html).toContain('data-task-status="/"');
    expect(html).toContain("task-list-item");
    expect(html).toContain("doing");
    expect(html).not.toContain("[/]");
  });

  it("normalizes alias markers", () => {
    expect(renderMarkdown("- [~] scrapped")).toContain('data-task-status="-"');
    expect(renderMarkdown("- [X] shouted")).toContain('data-task-status="x"');
  });

  it("tags plain GFM checkboxes too", () => {
    expect(renderMarkdown("- [ ] open")).toContain('data-task-status=" "');
    expect(renderMarkdown("- [x] done")).toContain('data-task-status="x"');
  });

  it("leaves unrecognized markers as literal text", () => {
    const html = renderMarkdown("- [z] not a status");

    expect(html).not.toContain("data-task-status");
    expect(html).toContain("[z]");
  });

  it("does not touch bracketed text that isn't at the head of an item", () => {
    const html = renderMarkdown("- see [/] later");

    expect(html).not.toContain("data-task-status");
  });
});
