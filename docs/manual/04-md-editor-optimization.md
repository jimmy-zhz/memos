# 4. Markdown Editor Optimization 

## 4.1  Callout

```markdown

> [!NOTE] this is a note

> [!INFO] info

> [!TODO] todo

> [!ASIDE] aside

> [!IMPORTANT] important

> [!CHECK] check

> [!DONE] done

> [!SUCCESS] success

> [!TIP] tip

> [!HINT] hint

> [!IMPORTANT] important

> [!WARNING] this is warning

> [!CAUTION] this is caution

> [!ATTENTION] attention

> [!ERROR] error

> [!FAILURE] failure

> [!FAIL] fail

> [!MISSING] missing

> [!DANGER] danger

> [!BUG] bug

> [!EXAMPLE] example

> [!QUOTE] quote

> [!CITE] cite

> [!ABSTRACT] abstract

> [!SUMMARY] summary

> [!TLDR] tldr

> [!QUESTION] question

> [!HELP] help

> [!FAQ] faq

#### 下面是自定义 

> [!IMPORTANT(📜)] this is a piece of important information , with a customed icon.

> [!NOTE(🎯)] this is a note with a customized target icon.

> [!TIP(💡)] this is a tip with a customized light bulb icon.

```
## 4.2 Keyboard Shortcuts

The home-page editor (`MemoEditor`) is built on CodeMirror 6 and provides
Notion / Obsidian–style formatting shortcuts. Throughout this page, **`Mod`**
means **`Cmd` on macOS** and **`Ctrl` on Windows / Linux**.

- **Command catalog:** `web/src/components/MemoEditor/formatting/commands.ts` —
  shared by both the toolbar buttons and the shortcuts, so a single command
  definition drives both.
- **Execution & keymap:**
  `web/src/components/MemoEditor/Editor/formatting.ts` — `applyCommand` runs a
  formatting command; `createFormattingKeymap` binds the keys.
- **Wiring:** `web/src/components/MemoEditor/Editor/extensions.ts` feeds
  `createFormattingKeymap()` into CodeMirror's `keymap.of([...])`.
- **Editor-level shortcuts:**
  `web/src/components/MemoEditor/hooks/useKeyboard.ts` — global keys at the
  editor level (currently just `Mod-Enter` to save).

---

## 4.1 Supported shortcuts

| Shortcut | Action | Notes |
| --- | --- | --- |
| `Mod-Enter` | Publish / save memo | Requires the editor to be focused. |
| `Mod-B` | Bold `**text**` | Toggles off when the cursor is already inside bold text. |
| `Mod-I` | Italic `*text*` | Toggles, same as above. |
| `Mod-E` | Inline code `` `text` `` | Toggles, same as above. |
| `Mod-K` | Insert / remove link `[text](url)` | With the cursor already inside a link, it expands back to plain text; when creating a new link you fill in the URL manually (the toolbar button behaves the same — there is no URL input popover yet). |
| `Mod-Shift-7` | Ordered list | Applies to all selected lines at once. |
| `Mod-Shift-8` | Bulleted list | Same as above. |
| `Mod-Shift-9` | Task list `- [ ]` | Same as above. |
| `Mod-Shift-0` | Insert checked task `- [x] ` | Inserts directly at the cursor; not a toggle and not wired into the command catalog. |
| `Mod-Alt-0` | Body text (clear heading) | |
| `Mod-Alt-1` / `Mod-Alt-2` / `Mod-Alt-3` | Heading 1 / 2 / 3 | Matches the toolbar's addressable range (H1–H3). |
| `Mod-Alt-4` / `Mod-Alt-5` | Heading 4 / 5 | Shortcut-only; not wired into the command catalog (`EditorCommandId` stops at heading3), so the toolbar and active-state highlight won't show H4/H5 — but the rendering and Markdown output are correct. |
| `Tab` / `Shift-Tab` | Indent / outdent list item | Pre-existing, not added in this pass. |
| `Escape` | Blur the editor | Pre-existing, not added in this pass. |
| `Mod-Z` / `Mod-Shift-Z` | Undo / redo | Comes from CodeMirror's `historyKeymap`. |

---

## 4.2 Not supported (intentionally deferred)

The Notion / Obsidian formats below have no toggle logic in the current
Markdown command catalog (`formatting/commands.ts`) yet, so they were left out
to avoid introducing new formatting capabilities that haven't been confirmed
with the product:

- Strikethrough (`~~text~~`)
- Underline
- Highlight / mark (`==text==`)
- Blockquote (`> `)
- Fenced code block (```` ``` ````)

To add one, you first extend `formatting/commands.ts` with the matching
`EditorCommandId` and `ActiveFormatState` field, implement the toggle in
`Editor/formatting.ts` (following the existing `toggleMark` / `toggleListLine`),
and then register the key binding in `createFormattingKeymap`.

---

## 4.3 Frontmatter properties

A document can open with an Obsidian-style YAML frontmatter block — a `---`
line, one `key: value` line per property, and a closing `---` line — before
the Markdown body:

```markdown
---
title: AI Ethics Week 1
tags: [ai, ethics]
status: completed
date: 2026-07-11
---

# body starts here
```

- **Parser:** `web/src/utils/frontmatter.ts` (`parseFrontmatter`) — line-based,
  not a full YAML engine. Frontmatter must be the very first thing in the
  document. Only flat scalar/list values are recognised (Obsidian's subset);
  nested maps, arrays of objects, and malformed lines are silently ignored and
  never rendered.
- **Supported value types:** `text`, `list` (`[a, b, c]`), `number`, `checkbox`
  (`true` / `false`), `date` (`YYYY-MM-DD`), `datetime`.
- **Rendering:** `web/src/components/MemoContent/PropertiesPanel.tsx` shows the
  parsed properties as a read-only key/value panel above the body — this panel
  never writes back to the document; editing a property means editing the raw
  frontmatter text.

Properties are free-form — you can add any key. Two keys are reserved and
change editor/viewer behavior instead of just being displayed:

| Key | Type | Effect |
| --- | --- | --- |
| `displayOutline` | checkbox | `displayOutline: false` collapses the document outline sidebar by default when the document is opened (see `web/src/components/Notebook/DocumentView.tsx`). Any other value, or omitting the key, falls back to the normal viewport-based default (collapsed on narrow screens, expanded on desktop). |
| `hidden` | checkbox | `hidden: true` hides the properties panel itself from the rendered document (see `PropertiesPanel.tsx`). The properties are still parsed and still take effect (e.g. `displayOutline` keeps working) — only the visual key/value list is suppressed. |

```markdown
---
displayOutline: false
hidden: true
---

# body starts here
```
