import { describe, expect, it } from "vitest";

import { upsertCalendarItem } from "@/components/MemoContent/calendar/upsertCalendarItem";

describe("calendar block normalization", () => {
  it("hoists config lines to the top and sorts date groups newest first", () => {
    const content = [
      "```calendar",
      "- 2026-07-01",
      "- [ ] old",
      "allowMaxUpdateDays: 7",
      "- 2026-07-20",
      "- [x] newer",
      "events: 跑步, 阅读",
      "```",
    ].join("\n");

    expect(upsertCalendarItem(content, "2026-07-10", "- [ ] mid")).toBe(
      [
        "```calendar",
        "allowMaxUpdateDays: 7",
        "events: 跑步, 阅读",
        "",
        "- 2026-07-20",
        "- [x] newer",
        "",
        "- 2026-07-10",
        "- [ ] mid",
        "",
        "- 2026-07-01",
        "- [ ] old",
        "```",
      ].join("\n"),
    );
  });

  it("keeps ungrouped items above the date groups", () => {
    const content = ["```calendar", "events: a", "- [ ] loose", "- 2026-07-01", "- [ ] old", "```"].join("\n");

    expect(upsertCalendarItem(content, "2026-07-05", "todo")).toBe(
      ["```calendar", "events: a", "", "- [ ] loose", "", "- 2026-07-05", "- [ ] todo", "", "- 2026-07-01", "- [ ] old", "```"].join("\n"),
    );
  });
});
