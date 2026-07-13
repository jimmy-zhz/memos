// String-level edits to a ```calendar fenced code block within a memo's raw
// markdown content. Operates on lines directly rather than an AST, since
// fenced code block contents are opaque to markdown ASTs.

const FENCE_START_RE = /^```calendar\s*$/;
const FENCE_END_RE = /^```\s*$/;
const DATE_LINE_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s*$/;
const ITEM_LINE_RE = /^-\s+(?:\[([ xX])\]\s+)?(.+)$/;
// Accepts "- [ ] text", "-[] text", "- [x] text", or plain "text" input lines.
const INPUT_LINE_RE = /^-?\s*\[([ xX]?)\]\s*(.+)$/;

interface CalendarFenceLocation {
  lines: string[];
  fenceStart: number;
  fenceEnd: number;
  blockLines: string[];
}

function locateCalendarFence(content: string): CalendarFenceLocation | undefined {
  const lines = content.split("\n");

  const fenceStart = lines.findIndex((line) => FENCE_START_RE.test(line));
  if (fenceStart === -1) {
    return undefined;
  }

  let fenceEnd = -1;
  for (let i = fenceStart + 1; i < lines.length; i++) {
    if (FENCE_END_RE.test(lines[i])) {
      fenceEnd = i;
      break;
    }
  }
  if (fenceEnd === -1) {
    return undefined;
  }

  return { lines, fenceStart, fenceEnd, blockLines: lines.slice(fenceStart + 1, fenceEnd) };
}

function rebuildContent(location: CalendarFenceLocation, newBlockLines: string[]): string {
  const { lines, fenceStart, fenceEnd } = location;
  return [...lines.slice(0, fenceStart + 1), ...newBlockLines, ...lines.slice(fenceEnd)].join("\n");
}

function formatItemLine(rawLine: string): string | undefined {
  const trimmed = rawLine.trim();
  if (!trimmed) return undefined;

  const match = INPUT_LINE_RE.exec(trimmed);
  if (match) {
    const checked = match[1].toLowerCase() === "x";
    const text = match[2].trim();
    if (!text) return undefined;
    return `- [${checked ? "x" : " "}] ${text}`;
  }

  return `- [ ] ${trimmed}`;
}

/**
 * Inserts new task lines for `date` at the top of that date's group inside
 * the first ```calendar fenced code block found in `content`. If the date
 * has no existing group, a new one is created at the top of the block.
 *
 * Returns the original content unchanged if no calendar block, or no valid
 * input lines, are found.
 */
export function upsertCalendarItem(content: string, date: string, rawInput: string): string {
  const newItemLines = rawInput
    .split("\n")
    .map(formatItemLine)
    .filter((line): line is string => Boolean(line));

  if (newItemLines.length === 0) {
    return content;
  }

  const location = locateCalendarFence(content);
  if (!location) {
    return content;
  }
  const { blockLines } = location;

  let dateLineIndex = -1;
  for (let i = 0; i < blockLines.length; i++) {
    const match = DATE_LINE_RE.exec(blockLines[i]);
    if (match && match[1] === date) {
      dateLineIndex = i;
      break;
    }
  }

  let newBlockLines: string[];
  if (dateLineIndex !== -1) {
    newBlockLines = [...blockLines.slice(0, dateLineIndex + 1), ...newItemLines, ...blockLines.slice(dateLineIndex + 1)];
  } else {
    newBlockLines = [`- ${date}`, ...newItemLines, "", ...blockLines];
  }

  return rebuildContent(location, newBlockLines);
}

/**
 * Toggles the checkbox of the `itemIndex`-th item (0-based, in document order)
 * within `date`'s group inside the ```calendar fenced code block. Items
 * without a checkbox are skipped, matching parseCalendarBlock's item ordering.
 *
 * Returns the original content unchanged if the block, date group, or item
 * can't be found, or if the item has no checkbox to toggle.
 */
export function toggleCalendarItem(content: string, date: string, itemIndex: number, checked: boolean): string {
  const location = locateCalendarFence(content);
  if (!location) {
    return content;
  }
  const { blockLines } = location;

  let dateLineIndex = -1;
  for (let i = 0; i < blockLines.length; i++) {
    const match = DATE_LINE_RE.exec(blockLines[i]);
    if (match && match[1] === date) {
      dateLineIndex = i;
      break;
    }
  }
  if (dateLineIndex === -1) {
    return content;
  }

  let groupEnd = blockLines.length;
  for (let i = dateLineIndex + 1; i < blockLines.length; i++) {
    if (DATE_LINE_RE.test(blockLines[i])) {
      groupEnd = i;
      break;
    }
  }

  // Count every item line (checkbox or not), matching parseCalendarBlock's
  // group.items ordering, so itemIndex lines up with the rendered list.
  let seen = 0;
  for (let i = dateLineIndex + 1; i < groupEnd; i++) {
    const match = ITEM_LINE_RE.exec(blockLines[i]);
    if (!match) continue;
    if (seen === itemIndex) {
      if (match[1] === undefined) return content; // no checkbox on this line, nothing to toggle
      const newBlockLines = [...blockLines];
      newBlockLines[i] = blockLines[i].replace(ITEM_LINE_RE, (_full, _check, text) => `- [${checked ? "x" : " "}] ${text}`);
      return rebuildContent(location, newBlockLines);
    }
    seen++;
  }

  return content;
}
