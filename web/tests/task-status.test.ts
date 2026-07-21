import { describe, expect, it } from "vitest";

import { parseCalendarBlock } from "@/components/MemoContent/calendar/parseCalendarBlock";
import { setCalendarItemStatus } from "@/components/MemoContent/calendar/upsertCalendarItem";
import { countTasks, extractTasks, setTaskStatusAtIndex, toggleTaskAtIndex } from "@/utils/markdown-manipulation";

const markdown = ["- [ ] open", "- [/] doing", "- [x] done", "- [~] scrapped", "- [?] unsure", "- plain item"].join("\n");

describe("extended task statuses", () => {
  it("indexes extended markers alongside plain GFM checkboxes", () => {
    expect(extractTasks(markdown).map((task) => [task.taskIndex, task.marker, task.content])).toEqual([
      [0, " ", "open"],
      [1, "/", "doing"],
      [2, "x", "done"],
      [3, "-", "scrapped"],
      [4, "?", "unsure"],
    ]);
  });

  it("writes a new marker at the indexed task", () => {
    expect(setTaskStatusAtIndex(markdown, 1, "!").split("\n")[1]).toBe("- [!] doing");
    expect(setTaskStatusAtIndex(markdown, 4, "x").split("\n")[4]).toBe("- [x] unsure");
  });

  it("normalizes alias markers when writing", () => {
    expect(setTaskStatusAtIndex(markdown, 0, "~").split("\n")[0]).toBe("- [-] open");
  });

  it("ignores unknown markers", () => {
    expect(setTaskStatusAtIndex(markdown, 0, "z")).toBe(markdown);
  });

  it("keeps toggle semantics for the plain checkbox path", () => {
    expect(toggleTaskAtIndex(markdown, 0, true).split("\n")[0]).toBe("- [x] open");
    expect(toggleTaskAtIndex(markdown, 2, false).split("\n")[2]).toBe("- [ ] done");
  });

  it("counts only [x] items as completed", () => {
    expect(countTasks(markdown)).toEqual({ total: 5, completed: 1, incomplete: 4 });
  });

  it("does not treat task-like lines inside code blocks as tasks", () => {
    const withCode = ["```", "- [/] not a task", "```", "- [/] real"].join("\n");
    expect(extractTasks(withCode).map((task) => task.marker)).toEqual(["/"]);
  });
});

describe("calendar block statuses", () => {
  const content = ["```calendar", "- 2026-07-01", "- [ ] a", "- [/] b", "- plain", "```"].join("\n");

  it("parses extended markers inside a calendar block", () => {
    const items = parseCalendarBlock(["- 2026-07-01", "- [ ] a", "- [/] b", "- [z] literal", "- plain"].join("\n")).groups[0].items;

    expect(items.map((item) => [item.marker, item.text])).toEqual([
      [" ", "a"],
      ["/", "b"],
      [undefined, "[z] literal"],
      [undefined, "plain"],
    ]);
  });

  it("writes an extended marker back to the right item", () => {
    expect(setCalendarItemStatus(content, "2026-07-01", 0, "?")).toContain("- [?] a");
    expect(setCalendarItemStatus(content, "2026-07-01", 1, "x")).toContain("- [x] b");
    // Plain-text items have no checkbox to set.
    expect(setCalendarItemStatus(content, "2026-07-01", 2, "x")).toBe(content);
  });
});
