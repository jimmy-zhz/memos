package memogit

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// PullResult summarizes a pull run.
type PullResult struct {
	Added     int
	Updated   int
	Unchanged int
	Conflicts []string // uids skipped because both sides changed
	Missing   []string // uids whose local file is gone (pending push)
}

// Pull incrementally fetches memos changed on the server since the last sync,
// updates local files where only the server changed, and commits. Files where
// both server and local changed are reported as conflicts and left untouched.
func Pull(ctx context.Context, root string, cfg *Config, out io.Writer) (*PullResult, error) {
	state, err := LoadState(root)
	if err != nil {
		return nil, err
	}
	if cfg.Workspace == "" {
		return nil, fmt.Errorf("config missing workspace; re-run `memogit clone` (older config?)")
	}
	client := NewClient(cfg)
	username, err := client.CurrentUsername(ctx)
	if err != nil {
		return nil, err
	}

	// Overlap by one second to avoid missing memos updated in the same second
	// as the last sync; the hash comparison below dedupes the overlap.
	sinceUnix := state.LastSync.Unix() - 1
	filter := fmt.Sprintf("(%s) && updated_ts > %d", scopedFilter(username, cfg.Filter), sinceUnix)
	fmt.Fprintf(out, "Pulling changes since %s (workspace %q) ...\n", state.LastSync.Format(time.RFC3339), cfg.WorkspaceTitle)

	memos, err := client.ListAllMemos(ctx, cfg.Workspace, filter)
	if err != nil {
		return nil, err
	}

	res := &PullResult{}
	for _, m := range memos {
		uid := uidFromName(m.GetName())
		newState := memoState(m) // path + metadata + canonical server hash
		serverHash := newState.ContentHash

		prev, tracked := state.Memos[uid]
		if !tracked {
			// New memo on the server.
			if _, err := exportMemo(root, m); err != nil {
				return nil, err
			}
			state.Memos[uid] = newState
			res.Added++
			fmt.Fprintf(out, "  + %s\n", newState.Path)
			continue
		}

		if serverHash == prev.ContentHash && newState.Path == prev.Path {
			res.Unchanged++
			continue // server didn't really change (overlap re-fetch)
		}

		localPath := filepath.Join(root, prev.Path)

		// PDF documents have no editable body — the local file is a generated
		// stub, so there is no "local edit" to conflict with. Just re-export and
		// adopt the server state.
		if prev.DocType == "PDF" || newState.DocType == "PDF" {
			if err := relocateAndWrite(root, prev.Path, newState.Path, FileContent(m)); err != nil {
				return nil, err
			}
			state.Memos[uid] = newState
			res.Updated++
			fmt.Fprintf(out, "  ~ %s\n", newState.Path)
			continue
		}

		// Read the local file to see whether it changed since last sync.
		data, readErr := os.ReadFile(localPath)
		if os.IsNotExist(readErr) {
			res.Missing = append(res.Missing, uid)
			fmt.Fprintf(out, "  ! %s: local file missing, skipped (resolve on push)\n", prev.Path)
			continue
		} else if readErr != nil {
			return nil, fmt.Errorf("read %s: %w", prev.Path, readErr)
		}
		if CanonicalHash(string(data)) != prev.ContentHash {
			// Both sides changed → conflict, leave the local file alone.
			res.Conflicts = append(res.Conflicts, uid)
			fmt.Fprintf(out, "  ⚠ %s: conflict (changed locally and on server), skipped\n", prev.Path)
			continue
		}

		// Only the server changed → adopt server content, relocating the file if
		// its folder_path/title (and thus path) changed.
		if err := relocateAndWrite(root, prev.Path, newState.Path, FileContent(m)); err != nil {
			return nil, err
		}
		state.Memos[uid] = newState
		res.Updated++
		fmt.Fprintf(out, "  ~ %s\n", newState.Path)
	}

	state.LastSync = time.Now().UTC()
	if err := state.Save(root); err != nil {
		return nil, err
	}
	if err := GitCommitAll(root, commitMessage(res)); err != nil {
		return nil, err
	}

	fmt.Fprintf(out, "Pull complete: %d added, %d updated, %d unchanged, %d conflicts.\n",
		res.Added, res.Updated, res.Unchanged, len(res.Conflicts))
	if len(res.Conflicts) > 0 {
		fmt.Fprintf(out, "Conflicts left for manual resolution (uids): %v\n", res.Conflicts)
	}
	return res, nil
}

func commitMessage(res *PullResult) string {
	return fmt.Sprintf("memogit pull: %d added, %d updated", res.Added, res.Updated)
}
