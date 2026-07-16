package memogit

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	v1pb "github.com/usememos/memos/proto/gen/api/v1"
)

// scopedFilter combines the implicit "own memos only" scoping with an optional
// extra CEL clause from config.
func scopedFilter(username, extra string) string {
	base := fmt.Sprintf("creator == %s", strconv.Quote(username))
	if strings.TrimSpace(extra) == "" {
		return base
	}
	return fmt.Sprintf("(%s) && (%s)", base, extra)
}

// writeFile writes raw content to <root>/<relPath>, creating parent dirs and
// ensuring exactly one trailing newline for clean git diffs.
func writeFile(root, relPath, content string) error {
	full := filepath.Join(root, relPath)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return fmt.Errorf("create dir for %s: %w", relPath, err)
	}
	body := strings.TrimRight(content, "\n") + "\n"
	if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", relPath, err)
	}
	return nil
}

// memoState builds the sync-state baseline for a memo (path + metadata + hash).
// The hash is over the server content (m.GetContent()), which is what push/pull
// compare against — not over the possibly-stubbed local file bytes.
func memoState(m *v1pb.Memo) MemoState {
	docType := docTypeString(m)
	relPath := RelPath(m.GetFolderPath(), m.GetTitle(), docType)
	return MemoState{
		Path:        relPath,
		DocType:     docType,
		Visibility:  m.GetVisibility().String(),
		Pinned:      m.GetPinned(),
		Relations:   relationUIDs(m),
		UpdateTime:  tsToTime(m.GetUpdateTime()),
		ContentHash: CanonicalHash(m.GetContent()),
	}
}

// exportMemo writes one memo to disk (verbatim content, or a PDF stub) and
// returns its baseline MemoState. Returns the relative path for logging.
func exportMemo(root string, m *v1pb.Memo) (MemoState, error) {
	ms := memoState(m)
	if err := writeFile(root, ms.Path, FileContent(m)); err != nil {
		return MemoState{}, err
	}
	return ms, nil
}

// relocateAndWrite writes content to newRel, and if the file moved from oldRel
// it removes the old file and prunes any now-empty parent directories (up to,
// but not including, the repo root) so relocations don't leave empty folders.
func relocateAndWrite(root, oldRel, newRel, content string) error {
	if err := writeFile(root, newRel, content); err != nil {
		return err
	}
	if oldRel == newRel {
		return nil
	}
	oldFull := filepath.Join(root, oldRel)
	if err := os.Remove(oldFull); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove old file %s: %w", oldRel, err)
	}
	pruneEmptyDirs(root, filepath.Dir(oldFull))
	return nil
}

// pruneEmptyDirs removes dir and its empty ancestors up to (exclusive) root.
// Non-empty dirs stop the walk; errors are ignored (best-effort cleanup).
func pruneEmptyDirs(root, dir string) {
	rootClean := filepath.Clean(root)
	for {
		dir = filepath.Clean(dir)
		if dir == rootClean || !strings.HasPrefix(dir, rootClean+string(filepath.Separator)) {
			return
		}
		if err := os.Remove(dir); err != nil {
			return // not empty, or gone
		}
		dir = filepath.Dir(dir)
	}
}

// checkPathCollisions guards against two distinct server documents mapping to
// the same local path after sanitization (e.g. titles differing only in
// reserved characters). The server's (workspace, folder_path, title) uniqueness
// prevents true duplicates, but filename sanitization can still collapse them,
// which would silently overwrite one file. Fail loudly instead.
func checkPathCollisions(memos []*v1pb.Memo, out io.Writer) error {
	seen := make(map[string]string, len(memos)) // path -> "folder_path::title"
	for _, m := range memos {
		p := RelPath(m.GetFolderPath(), m.GetTitle(), docTypeString(m))
		key := m.GetFolderPath() + "::" + m.GetTitle()
		if prev, ok := seen[p]; ok && prev != key {
			return fmt.Errorf("path collision: %q and %q both map to %q; "+
				"rename one on the server (titles differ only in reserved characters)", prev, key, p)
		}
		seen[p] = key
	}
	return nil
}
