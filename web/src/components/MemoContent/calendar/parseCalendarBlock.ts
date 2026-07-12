export interface CalendarItem {
  text: string;
  checked?: boolean; // undefined = 无 checkbox 的纯文本条目
}

export interface CalendarGroup {
  date?: string; // YYYY-MM-DD；undefined 表示"未分组"区块
  items: CalendarItem[];
}

const DATE_LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*$/;
const ITEM_LINE_RE = /^-\s+(?:\[([ xX])\]\s+)?(.+)$/;

export function parseCalendarBlock(raw: string): CalendarGroup[] {
  const groups: CalendarGroup[] = [];
  let ungrouped: CalendarGroup | undefined;
  let current: CalendarGroup | undefined;

  for (const line of raw.split("\n")) {
    const dateMatch = DATE_LINE_RE.exec(line);
    if (dateMatch) {
      current = { date: dateMatch[1], items: [] };
      groups.push(current);
      continue;
    }

    const itemMatch = ITEM_LINE_RE.exec(line);
    if (itemMatch) {
      const item: CalendarItem = {
        text: itemMatch[2],
        checked: itemMatch[1] === undefined ? undefined : itemMatch[1].toLowerCase() === "x",
      };
      if (current) {
        current.items.push(item);
      } else {
        if (!ungrouped) {
          ungrouped = { date: undefined, items: [] };
        }
        ungrouped.items.push(item);
      }
    }
  }

  if (ungrouped) {
    groups.unshift(ungrouped);
  }

  return groups;
}
