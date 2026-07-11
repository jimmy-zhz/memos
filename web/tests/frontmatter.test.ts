import { describe, expect, it } from "vitest";
import { hasFrontmatter, parseFrontmatter } from "@/utils/frontmatter";

describe("parseFrontmatter", () => {
  it("returns the original content untouched when there is no frontmatter", () => {
    const content = "# Title\n\nSome body text.";
    const result = parseFrontmatter(content);
    expect(result.properties).toEqual([]);
    expect(result.body).toBe(content);
  });

  it("does not treat a non-leading `---` block as frontmatter", () => {
    const content = "intro\n\n---\ntitle: x\n---\n";
    const result = parseFrontmatter(content);
    expect(result.properties).toEqual([]);
    expect(result.body).toBe(content);
  });

  it("classifies each scalar type and strips the block from the body", () => {
    const content = [
      "---",
      "title: AI Ethics Week 1",
      "count: 42",
      "ratio: 3.14",
      "done: true",
      "pending: false",
      "date: 2026-07-11",
      "at: 2026-07-11T10:30:00",
      "empty:",
      "---",
      "# Body",
    ].join("\n");

    const { properties, body } = parseFrontmatter(content);
    expect(body).toBe("# Body");
    expect(properties).toEqual([
      { key: "title", type: "text", value: "AI Ethics Week 1" },
      { key: "count", type: "number", value: 42 },
      { key: "ratio", type: "number", value: 3.14 },
      { key: "done", type: "checkbox", value: true },
      { key: "pending", type: "checkbox", value: false },
      { key: "date", type: "date", value: "2026-07-11" },
      { key: "at", type: "datetime", value: "2026-07-11T10:30:00" },
      { key: "empty", type: "text", value: null },
    ]);
  });

  it("parses both flow and block lists", () => {
    const content = ["---", "tags: [ai, ethics]", "authors:", "  - Alice", "  - Bob", "---", "body"].join("\n");
    const { properties } = parseFrontmatter(content);
    expect(properties).toEqual([
      { key: "tags", type: "list", value: ["ai", "ethics"] },
      { key: "authors", type: "list", value: ["Alice", "Bob"] },
    ]);
  });

  it("keeps quoted values as text even when they look like other types", () => {
    const content = ['---', 'a: "2026-07-11"', "b: 'true'", 'c: "42"', "---", "body"].join("\n");
    const { properties } = parseFrontmatter(content);
    expect(properties).toEqual([
      { key: "a", type: "text", value: "2026-07-11" },
      { key: "b", type: "text", value: "true" },
      { key: "c", type: "text", value: "42" },
    ]);
  });

  it("ignores non-compliant nested maps but keeps sibling compliant fields", () => {
    const content = ["---", "title: Hello", "meta:", "  author: Alice", "  year: 2026", "status: done", "---", "body"].join("\n");
    const { properties } = parseFrontmatter(content);
    expect(properties).toEqual([
      { key: "title", type: "text", value: "Hello" },
      { key: "status", type: "text", value: "done" },
    ]);
  });

  it("dedupes repeated keys, keeping the first occurrence", () => {
    const content = ["---", "title: First", "title: Second", "---", "body"].join("\n");
    const { properties } = parseFrontmatter(content);
    expect(properties).toEqual([{ key: "title", type: "text", value: "First" }]);
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\ntitle: Hi\r\n---\r\n# Body";
    const { properties, body } = parseFrontmatter(content);
    expect(properties).toEqual([{ key: "title", type: "text", value: "Hi" }]);
    expect(body).toBe("# Body");
  });

  it("strips an empty frontmatter block and renders no properties", () => {
    const content = "---\n---\nbody";
    const { properties, body } = parseFrontmatter(content);
    expect(properties).toEqual([]);
    expect(body).toBe("body");
  });
});

describe("hasFrontmatter", () => {
  it("detects a leading frontmatter block", () => {
    expect(hasFrontmatter("---\ntitle: x\n---\nbody")).toBe(true);
    expect(hasFrontmatter("# no frontmatter")).toBe(false);
    expect(hasFrontmatter("text\n---\ntitle: x\n---")).toBe(false);
  });
});
