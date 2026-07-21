import { describe, expect, it } from "vitest";
import { DEFAULT_GALLERY_BLOCK, parseGalleryViewConfig, serializeGalleryViewConfig } from "@/components/GalleryView/types";

const config = (frontmatter?: string) => ({
  viewType: "gallery" as const,
  blocks: [DEFAULT_GALLERY_BLOCK],
  frontmatter,
});

describe("serializeGalleryViewConfig", () => {
  it("wraps plain frontmatter in a single fence", () => {
    const content = serializeGalleryViewConfig(config("title: My view"));
    expect(content.startsWith("---\ntitle: My view\n---\n{")).toBe(true);
  });

  it("does not double the fence when the author typed their own", () => {
    const content = serializeGalleryViewConfig(config("---\ntitle: My view\n---"));
    expect(content.startsWith("---\ntitle: My view\n---\n{")).toBe(true);
    // The document must still round-trip: this is the case that used to make a
    // whole view unparseable, i.e. render blank and then be saved over as empty.
    const parsed = parseGalleryViewConfig(content);
    expect(parsed?.blocks).toHaveLength(1);
    expect(parsed?.frontmatter).toBe("title: My view");
  });

  it("omits the fence entirely when the frontmatter is only delimiters", () => {
    expect(serializeGalleryViewConfig(config("---\n---")).startsWith("{")).toBe(true);
  });
});

describe("parseGalleryViewConfig", () => {
  it("round-trips a config without frontmatter", () => {
    const parsed = parseGalleryViewConfig(serializeGalleryViewConfig(config()));
    expect(parsed?.blocks).toHaveLength(1);
    expect(parsed?.frontmatter).toBeUndefined();
  });

  it("salvages documents already saved with doubled fences", () => {
    const json = JSON.stringify({ viewType: "gallery", blocks: [DEFAULT_GALLERY_BLOCK] }, null, 2);
    const broken = `---\n---\ntitle: My view\n---\n---\n${json}`;

    const parsed = parseGalleryViewConfig(broken);
    expect(parsed?.blocks).toHaveLength(1);
    expect(parsed?.frontmatter).toBe("title: My view");
  });

  it("still rejects content that is not a gallery view", () => {
    expect(parseGalleryViewConfig("# just a document")).toBeUndefined();
    expect(parseGalleryViewConfig("")).toBeUndefined();
    expect(parseGalleryViewConfig('{"viewType":"other"}')).toBeUndefined();
  });
});
