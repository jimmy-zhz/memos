# 2. Rich Documents & Media

Upstream Memos stores one kind of content: Markdown text. In the AI era, a lot
of valuable knowledge arrives as **self-contained HTML** (Claude/GPT often
answer with runnable HTML) or **PDF** (papers, reports, scans). This fork treats
those as **first-class, render-only document types** alongside Markdown, and
upgrades attachment handling so audio, video, and images play inline.

Every document has a `doc_type`
(`proto/api/v1/memo_service.proto`, `Memo.DocType`):

| `doc_type` | Editable? | Rendered by | Notes |
|------------|-----------|-------------|-------|
| `MARKDOWN` | ✅ full editor | Memos Markdown renderer | The default. |
| `HTML` | ✅ source only | sandboxed `<iframe>` | Preview fills the main content. |
| `PDF` | ❌ preview only | `PdfViewer` (pdf.js) | Backed by an uploaded file; carries no editable text body. |
| `VIEW` | ✅ guided form | `GalleryViewRenderer` | Configuration only — see [Gallery Views](./03-gallery-views.md). |

All four flow through **one** "dispatch renderer by doc type" mechanism, so
there is a single place that decides how each type is shown.

---

## 2.1 Upload doc vs. Upload file

The `+` button (next to the search box) and a folder's **⋯ menu** both expose
two distinct upload entries:

- **Upload doc** — for content that lives *in the database as an editable
  document*: `.md` and `.html` files. The file's text becomes the document's
  content.
- **Upload file** — for a **render-only** artifact: currently `.pdf`. The file
  is stored in your configured storage backend (see §2.5) and a document is
  created at the target folder that *references* it. This document has no
  editable text body — opening it goes straight to preview.

Whichever entry point you use, the new document lands in the folder you launched
the dialog from.

---

## 2.2 HTML documents

- **Preview:** rendered in a **sandboxed `<iframe>`** (via `srcdoc`) that fills
  the remaining main-content area, just like the Markdown preview. The sandbox
  denies `same-origin`, so page scripts can't read your session cookies.
- **Edit:** a plain source-code text editor. HTML is rarely hand-edited here, so
  there is intentionally no rich HTML editing surface — you get the raw source.
- **No outline**, no outline toggle (those are Markdown-only).
- The HTML string is stored in the document's own `content` field (one record =
  one document); uploading a `.html` file reads its content into a new document
  rather than attaching it as a file.

---

## 2.3 PDF documents

PDF documents are backed by an uploaded file and rendered with a **pdf.js-based
viewer** (`web/src/components/PdfViewer/`) for a consistent, cross-browser
experience (paging, zoom, dark-mode adaptation) instead of relying on the
browser's native embed.

Features:

- **Paged canvas rendering** (`PdfPages.tsx`) with a toolbar
  (`PdfToolbar.tsx`) for navigation and zoom.
- **Annotations** (`usePdfAnnotations.ts`, `PdfAnnotationLayer.tsx`,
  `PdfAnnotationSidebar.tsx`) — add notes/marks on top of pages, listed in a
  side panel.
- **Text extraction** (`extractPdfText.ts`) — pull selectable/searchable text
  out of the PDF.

### PDF everywhere it needs to appear

A PDF document is, at its core, a link/reference — so it renders differently
depending on context:

- **Notebook (`/`)** — full PDF viewer in the main content area.
- **Explore feed (`/explore`)** — the card does **not** try to render the PDF
  body. It shows the card title plus file info and a **jump-to-detail** button
  (the same target as *Copy → Copy link*), rendered by `PdfDocCard.tsx`.
- **Document detail page** (the *Copy link* URL) — full PDF viewer, same as the
  Notebook.

---

## 2.4 Inline media & attachments

Attachment handling is upgraded so media is embedded where you'd expect it.

### While editing

- **Paste** a supported image/audio/video into the editor → it is uploaded and
  an in-site `![](…)` reference is inserted **at the cursor**.
- **Toolbar `+ → Media`** → the media is uploaded and attached in the
  **attachment area** (not inlined). The `+ → Media` picker accepts mainstream
  image **and** audio/video formats, not just images.
- **Non-media files** (documents, archives, etc.) always go to the attachment
  area, regardless of how they're added, with no prompt.
- **Media files are capped at 10 MB.**

### While previewing

- **Media attachments** (images, audio, video) render **at the bottom of the
  document** with real, playable `<audio>` / `<video>` players.
- **Non-media attachments** are listed by filename as links (with a jump URL).

### Where inline media plays

Playable audio/video now works across the main Markdown viewing surfaces:
Notebook preview, the Explore document list, and the *Copy link* detail page.
This reuses Memos' existing attachment player components
(`VideoPoster.tsx`, `AudioAttachmentItem.tsx`, `AttachmentCard.tsx`) rather than
introducing a parallel renderer.

> **Why not `![](clip.mp4)` in Markdown?** Upstream Memos' Markdown pipeline
> uses `rehype-sanitize`, which strips hand-written `<audio>`/`<video>` tags.
> Inline players therefore come from the **attachment** path, not from custom
> Markdown syntax. Trusted iframe embeds (YouTube, Vimeo, Spotify, SoundCloud,
> Loom, Google Maps, draw.io) remain supported via the existing allow-list.

---

## 2.5 Storage: S3 proxy & backup

Storage is an **admin-only, instance-wide** setting (`InstanceSetting`) — there
is one storage configuration for the whole instance.

### S3 access goes through the Memos domain

When S3 (S3-compatible / MinIO) is the default storage, uploads and reads are
**proxied through the Memos server** instead of handing raw presigned MinIO URLs
to the browser:

```
Upload:  browser → Memos server (signed) → MinIO → bucket URI
                → Memos returns a permanent https://<memos-domain>/... URL
Preview: browser → permanent Memos URL → Memos server (signed) → MinIO → bytes
```

Why this matters:

- **Network isolation** — MinIO endpoints are often only reachable on an
  internal/container network, so browser-direct presigned URLs would fail.
- **Unified access control** — all authorization stays inside Memos' own
  session/permission model; presigned URLs that leak can't be replayed for
  days.
- **Cacheable / CDN-friendly** — a stable domain URL can sit behind a CDN.

The proxy route (`/file/*` →
`server/router/fileserver/fileserver.go`) already reads bytes from LOCAL / S3 /
DB storage, so this change is mostly "stop exposing raw presigned URLs."

### Settings → Storage layout

- **Storage Configuration** — holds the storage source's credentials/config.
  Once configured it persists; a delete button lets an admin remove the
  credentials from the server.
- **Attachment storage** — a dropdown that selects which configured source is
  actually used. Changing it later prompts a confirmation (documents already
  written elsewhere are hard to migrate).
- **Database backup** — see below.

### SQLite backup to S3

For instances running on **SQLite**, an admin can back the whole database file
up to an **S3-compatible** bucket:

- **Manual backup** — "Back up now".
- **Automatic backup** — the server backs up once per week.
- Retention is handled by **S3 bucket versioning** (keep ~3 months; older
  versions expire) — Memos just pushes a gzip'd copy of the database file.
- **Scope:** SQLite database file only. Not MySQL/Postgres (use their native
  tooling), and **not** attachments.

See [`../plans/2026-07-04-media_pdf/s3-storage-proxy-plan.md`](../plans/2026-07-04-media_pdf/s3-storage-proxy-plan.md)
for the full design.
