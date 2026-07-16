# 5. memogit CLI — Check Out Your Knowledge Base as Files

Everything else in this manual is about working *inside* the app. `memogit` is
the opposite: a small command-line tool that **checks a knowledge base out to
local Markdown files**, so you (or an AI agent like Claude Code) can `grep`,
bulk-edit, and cross-reference documents with ordinary filesystem tools, then
sync changes back to the server.

It borrows git's vocabulary — `clone`, `pull`, (later) `push` — but it does
**not** implement the git network protocol. It is a thin **DB ↔ local file**
bridge over the existing Memos API; version history is delegated to a real local
git repo that `memogit` initializes for you.

> **Status:** `login`, `clone`, and `pull` are implemented. `push`, `status`,
> and attachment sync are not yet available (see §5.9). Treat the current tool as
> **read-mostly**: pull the knowledge base down and read/analyze it locally.

---

## 5.1 Core model (how the local tree maps to the server)

One **checkout directory = one workspace** (knowledge base). Inside it, each
document is written to a path that mirrors the server hierarchy:

```
<folder_path>/<title>.<ext>
```

- **`folder_path`** — the document's slash-separated folder path becomes the
  local directory (workspace-root documents land directly in the checkout root).
- **`title`** — the document title becomes the filename.
- **`.<ext>`** — chosen by the document's `doc_type`:

| `doc_type` | Extension | Local file holds |
|------------|-----------|------------------|
| `MARKDOWN` | `.md` | the Markdown content, verbatim |
| `HTML` | `.html` | the raw HTML source |
| `PDF` | `.pdf.md` | a small reference stub (the PDF bytes live in an attachment; downloading them is future work) |
| `VIEW` | `.view.json` | the gallery view's configuration JSON |

The server enforces uniqueness on `(workspace, folder_path, title)`, so this path
is unique on its own — no ID is baked into the filename.

### Files hold your content, nothing else

`memogit` does **not** wrap files in its own metadata header. A document's file
contains exactly its content — including any Obsidian-style `---` frontmatter you
wrote yourself (the properties that feed Gallery Views). All bookkeeping
(document ID, doc type, visibility, sync hashes, relations) lives separately in
`.memogit/sync-state.json`, keyed by document ID. This keeps the files clean and
avoids a confusing second frontmatter block.

---

## 5.2 Layout of a checkout

```
my-kb/                        ← one workspace
├── .memogit/
│   ├── config.yaml           ← server URL, token, bound workspace (chmod 600)
│   └── sync-state.json       ← per-document sync baseline (ID ↔ path, hashes…)
├── .git/                     ← a real local git repo (snapshots only, no remote)
├── .gitignore                ← excludes .memogit/config.yaml (it holds a token)
├── garden/notes/todo.md
├── papers/attention.pdf.md
└── dashboards/all.view.json
```

`.memogit/config.yaml` is git-ignored because it contains your Personal Access
Token; the rest of the tree (including `sync-state.json`) is tracked so your
baseline is captured in git history.

---

## 5.3 Install

`memogit` builds from the Memos repository as a single self-contained binary:

```bash
# From the repo root
go build -o memogit ./cmd/memogit/

# Put it on your PATH (either one)
cp memogit ~/bin/            # if ~/bin is on PATH
sudo cp memogit /usr/local/bin/
```

Verify:

```bash
memogit --help
```

---

## 5.4 Authenticate (`login`)

Generate a **Personal Access Token** in the app:
**Settings → My Account → Access Tokens → Create**. A PAT is long-lived and
suited to CLI use (no 15-minute refresh dance).

Then, from the directory you want to use as your knowledge-base checkout:

```bash
mkdir my-kb && cd my-kb
memogit login --server http://localhost:5230 --token memos_pat_xxxxxxxx
```

This writes `.memogit/config.yaml` (mode 600). Environment variables
`MEMOGIT_SERVER` / `MEMOGIT_TOKEN` override the file when set (useful for CI).

> **The `--server` URL must point at the Memos backend**, not a frontend dev
> server. See §5.8 if you're unsure which port that is.

---

## 5.5 Check out a knowledge base (`clone`)

```bash
# If your account has exactly one workspace, the name is optional:
memogit clone

# Otherwise name the workspace (its display title):
memogit clone Life

# Optionally restrict what gets pulled with a CEL filter:
memogit clone Life --filter '"work" in tags'
```

`clone`:

1. Resolves the workspace (by title) and records it in `config.yaml` so later
   `pull` reuses it.
2. Fetches **your own** documents in that workspace (see §5.7).
3. Writes each to `<folder_path>/<title>.<ext>`.
4. Runs `git init` and commits a **baseline snapshot**.

If the account has several workspaces and you don't name one, `clone` stops and
lists the candidates rather than guessing.

`clone` refuses to run if the directory has already been cloned — use `pull` to
update it.

---

## 5.6 Sync down changes (`pull`)

```bash
memogit pull
```

`pull` fetches everything changed on the server since the last sync
(incrementally, by update time), reconciles it against your local files, and
makes a git commit. For each changed document:

| Situation | What `pull` does |
|-----------|------------------|
| New on server | writes the file (`+`) |
| Changed on server, unchanged locally | overwrites the file, relocating it if its folder/title changed (`~`) |
| Changed on **both** sides | **conflict** — skips the file untouched, reports it (`⚠`) for you to resolve by hand |
| Local file deleted | skipped (`!`), to be resolved on a future `push` |

> **What `pull` does *not* do yet:** it won't remove local files for documents
> that were **deleted or archived** on the server since your last sync — those
> stale files linger until reconciliation lands in a later version.

---

## 5.7 Why only *your* documents?

Memos' visibility model lets any signed-in user read another user's `PROTECTED`
or `PUBLIC` documents (this is the sharing/Explore feature — a PAT doesn't change
it). So `memogit` deliberately scopes `clone`/`pull` to documents **you created**
(`creator == <your-username>`). Without that, your local knowledge base would
fill up with other people's shared notes that you can't sync back anyway.

---

## 5.8 Config & state files

**`.memogit/config.yaml`**

```yaml
server: http://localhost:5230
token: memos_pat_xxxxxxxx
workspace: workspaces/8650daea...     # set by clone
workspace_title: Default              # display only
filter: ""                            # optional CEL clause
```

**`.memogit/sync-state.json`** — the single source of truth for document
metadata: for each document ID, its local path, doc type, visibility, pin state,
relations (read-only export), and the server `update_time` + content hash at last
sync. `pull`/`push` compare against these hashes to decide who changed.

---

## 5.9 What's not implemented yet

| Feature | Status |
|---------|--------|
| `push` (sync local edits back; delete → archive) | planned (next) |
| `status` (local git diff + unsynced state) | planned |
| Attachment / PDF byte download & upload | planned |
| Relations written back to the server | out of scope for v1 (read-only export) |
| Reconciling server-side deletions during `pull` | not yet |

---

## 5.10 Troubleshooting

**`connection refused` on `clone`/`pull`.** The `--server` port is wrong or
points at the frontend. Find the **backend** port:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep -i memos    # e.g. "memos ... TCP *:8081 (LISTEN)"
ps aux | grep -i memos                          # look for --port
```

A dev setup often runs the Vite **frontend** on one port (e.g. 3001) and the
Memos **backend** on another (e.g. 8081); `memogit` must target the backend. If
you see `dial tcp [::1]:<port>: connection refused`, that's an ordinary refused
connection to the IPv6 `localhost` — fix the port, then re-run `login` with the
correct `--server`. Confirm connectivity first with:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8081/api/v1/workspaces \
  -H "Authorization: Bearer memos_pat_xxxxxxxx"     # expect 200
```

**`clone` reports "Cloned 0 memos".** The workspace resolved and authenticated,
but no documents matched. Most likely the documents predate the
workspace/`folder_path` fields and aren't associated with a named workspace yet.
Check without the workspace filter:

```bash
curl -s -G http://localhost:8081/api/v1/memos \
  --data-urlencode 'filter=creator == "YourUsername"' \
  -H "Authorization: Bearer memos_pat_xxxxxxxx" | head -c 500
```

If that returns documents but `clone` doesn't, the documents need to be assigned
to a workspace in the app first.

**Re-login to change server/token.** Just run `memogit login …` again; it
overwrites `.memogit/config.yaml`.
