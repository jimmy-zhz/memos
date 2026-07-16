package memogit

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// MemoState is the last-synced baseline for one memo. Under the sidecar model
// this is the ONLY place memo metadata lives — the exported file holds just the
// content, so uid/doc_type/visibility/etc. are tracked here, keyed by uid.
type MemoState struct {
	// Path is the repo-relative file path (also lets pull relocate/rename files
	// and lets push map a file back to its uid).
	Path string `json:"path"`
	// DocType is MARKDOWN/HTML/PDF/VIEW.
	DocType string `json:"doc_type"`
	// Visibility is PRIVATE/PROTECTED/PUBLIC.
	Visibility string `json:"visibility"`
	// Pinned mirrors the server pin state.
	Pinned bool `json:"pinned,omitempty"`
	// Relations are related memo uids (read-only export in v1).
	Relations []string `json:"relations,omitempty"`
	// UpdateTime is the server update_time at last sync (conflict detection).
	UpdateTime time.Time `json:"update_time"`
	// ContentHash is the server content hash at last sync.
	ContentHash string `json:"content_hash"`
}

// State is the .memogit/sync-state.json document.
type State struct {
	Server   string               `json:"server"`
	LastSync time.Time            `json:"last_sync"`
	Memos    map[string]MemoState `json:"memos"` // keyed by uid
}

// NewState returns an empty state for a server.
func NewState(server string) *State {
	return &State{Server: server, Memos: map[string]MemoState{}}
}

// PathIndex returns a reverse "repo-relative path → uid" lookup, used by push
// to tell tracked files apart from newly created local files.
func (s *State) PathIndex() map[string]string {
	idx := make(map[string]string, len(s.Memos))
	for uid, m := range s.Memos {
		idx[m.Path] = uid
	}
	return idx
}

// LoadState reads .memogit/sync-state.json under root. Returns an error if the
// repo has not been cloned yet.
func LoadState(root string) (*State, error) {
	path := filepath.Join(root, MetaDir, StateFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no sync state found — run `memogit clone` first")
		}
		return nil, fmt.Errorf("read state: %w", err)
	}
	st := &State{}
	if err := json.Unmarshal(data, st); err != nil {
		return nil, fmt.Errorf("parse state %s: %w", path, err)
	}
	if st.Memos == nil {
		st.Memos = map[string]MemoState{}
	}
	return st, nil
}

// Save writes the state to .memogit/sync-state.json under root.
func (s *State) Save(root string) error {
	dir := filepath.Join(root, MetaDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", dir, err)
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}
	path := filepath.Join(dir, StateFile)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write state %s: %w", path, err)
	}
	return nil
}
