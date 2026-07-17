package rag

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/pkg/errors"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/store"
)

// Mode selects the retrieval strategy.
type Mode int

const (
	// ModeMixed fuses keyword and semantic retrieval.
	ModeMixed Mode = iota
	// ModeKeyword uses full-text (FTS) retrieval only.
	ModeKeyword
	// ModeSemantic uses vector (embedding) retrieval only.
	ModeSemantic
	// ModeLike uses plain substring (SQL LIKE) retrieval over raw memo title/content,
	// bypassing the chunk/FTS/vector index entirely. Covers every doc type immediately.
	ModeLike
)

const (
	// rrfK is the RRF constant; larger values flatten rank influence.
	rrfK = 60
	// candidateLimit caps how many documents each retrieval path contributes.
	candidateLimit = 50
	// snippetRunes is the target snippet length.
	snippetRunes = 200
	// semanticMinSimilarity is the cosine floor below which a purely semantic
	// (no keyword match) hit is treated as noise and dropped. FTS/substring matches
	// are always kept regardless of this floor.
	semanticMinSimilarity = 0.22
	// relativeScoreCutoff drops long-tail hits whose fused score falls below this
	// fraction of the top hit's score. The top hit is always kept. Only purely
	// semantic hits are subject to this cutoff; keyword matches are never trimmed.
	relativeScoreCutoff = 0.25
)

// SearchParams describes a scoped retrieval request. MemoIDs is the permission-
// scoped candidate set computed by the caller; an empty (non-nil) slice yields
// no results.
type SearchParams struct {
	Query   string
	MemoIDs []int32
	Mode    Mode
	Limit   int
}

// Hit is a document-level search result.
type Hit struct {
	MemoID      int32
	WorkspaceID int32
	FolderPath  string
	Score       float64
	Snippet     string
	Highlights  []string
}

// Result bundles hits with the mode actually applied.
type Result struct {
	Hits          []Hit
	EffectiveMode Mode
}

// Search runs hybrid retrieval over the scoped candidate memos.
func Search(ctx context.Context, s *store.Store, params SearchParams) (*Result, error) {
	query := strings.TrimSpace(params.Query)
	if query == "" {
		return &Result{Hits: []Hit{}, EffectiveMode: params.Mode}, nil
	}
	if params.MemoIDs != nil && len(params.MemoIDs) == 0 {
		return &Result{Hits: []Hit{}, EffectiveMode: params.Mode}, nil
	}
	limit := params.Limit
	if limit <= 0 {
		limit = 20
	}

	// LIKE mode bypasses the search index entirely: a plain substring scan over raw
	// memo title/content. It needs no embedding and covers every document type.
	if params.Mode == ModeLike {
		hits, err := likeSearch(ctx, s, query, params.MemoIDs, limit)
		if err != nil {
			return nil, err
		}
		return &Result{Hits: hits, EffectiveMode: ModeLike}, nil
	}

	embedding, err := resolveEmbedding(ctx, s)
	if err != nil {
		return nil, err
	}

	// Downgrade to keyword-only when semantic retrieval is unavailable.
	effective := params.Mode
	if !embedding.Configured {
		effective = ModeKeyword
	}

	var ftsResults []*store.ChunkFTSResult
	runFTS := func() error {
		// The store tokenizes the query and handles short (sub-trigram) terms via a
		// LIKE fallback, so no minimum-length guard is needed here.
		results, ftsErr := s.SearchMemoChunksFTS(ctx, &store.ChunkFTSQuery{
			Query:   query,
			MemoIDs: params.MemoIDs,
			Limit:   candidateLimit,
		})
		if ftsErr != nil {
			return errors.Wrap(ftsErr, "full-text search failed")
		}
		ftsResults = results
		return nil
	}

	if effective != ModeSemantic {
		if err := runFTS(); err != nil {
			return nil, err
		}
	}

	var vecResults []scoredChunk
	if effective != ModeKeyword && embedding.Configured {
		vecResults, err = vectorSearch(ctx, s, embedding, query, params.MemoIDs)
		if err != nil {
			// Embedding failed at query time (rate limit, quota, network, etc.). Rather
			// than failing the whole search, degrade gracefully to keyword-only so the
			// user still gets FTS results. Ensure FTS ran (semantic-only skipped it).
			slog.Warn("semantic search unavailable; falling back to keyword-only", slog.Any("error", err))
			vecResults = nil
			effective = ModeKeyword
			if ftsResults == nil {
				if err := runFTS(); err != nil {
					return nil, err
				}
			}
		}
	}

	hits := fuseAndDedup(ftsResults, vecResults, query, limit)
	return &Result{Hits: hits, EffectiveMode: effective}, nil
}

type scoredChunk struct {
	ChunkID     int32
	MemoID      int32
	WorkspaceID int32
	FolderPath  string
	Content     string
	Similarity  float64
}

// vectorSearch embeds the query and ranks scoped chunks by cosine similarity.
func vectorSearch(ctx context.Context, s *store.Store, embedding EmbeddingResolution, query string, memoIDs []int32) ([]scoredChunk, error) {
	vectors, err := ai.Embed(ctx, embedding.Provider, embedding.Model, []string{query})
	if err != nil {
		return nil, err
	}
	if len(vectors) != 1 {
		return nil, errors.New("query embedding failed")
	}
	queryVec := vectors[0]

	hasEmbedding := true
	chunks, err := s.ListMemoChunks(ctx, &store.FindMemoChunk{MemoIDs: memoIDs, HasEmbedding: &hasEmbedding})
	if err != nil {
		return nil, err
	}

	// Collapse to the best-scoring chunk per memo so a single long document with many
	// chunks can't monopolize the candidate pool; candidateLimit then bounds distinct
	// documents rather than chunks.
	bestByMemo := make(map[int32]scoredChunk, len(chunks))
	for _, c := range chunks {
		// Only compare against chunks embedded with the active model/dim.
		if len(c.Embedding) != len(queryVec) {
			continue
		}
		sim := cosine(queryVec, c.Embedding)
		if existing, ok := bestByMemo[c.MemoID]; ok && existing.Similarity >= sim {
			continue
		}
		bestByMemo[c.MemoID] = scoredChunk{
			ChunkID:     c.ID,
			MemoID:      c.MemoID,
			WorkspaceID: c.WorkspaceID,
			FolderPath:  c.FolderPath,
			Content:     c.Content,
			Similarity:  sim,
		}
	}
	scored := make([]scoredChunk, 0, len(bestByMemo))
	for _, c := range bestByMemo {
		scored = append(scored, c)
	}
	sort.Slice(scored, func(i, j int) bool {
		if scored[i].Similarity == scored[j].Similarity {
			return scored[i].MemoID < scored[j].MemoID
		}
		return scored[i].Similarity > scored[j].Similarity
	})
	if len(scored) > candidateLimit {
		scored = scored[:candidateLimit]
	}
	return scored, nil
}

// likeSearch runs a plain substring (SQL LIKE) query over raw memo title/content
// and builds document-level hits. Title matches are surfaced even when the term
// does not appear in the body, and non-markdown documents are covered too.
func likeSearch(ctx context.Context, s *store.Store, query string, memoIDs []int32, limit int) ([]Hit, error) {
	results, err := s.SearchMemosLike(ctx, &store.MemoLikeQuery{
		Query:   query,
		MemoIDs: memoIDs,
		Limit:   limit,
	})
	if err != nil {
		return nil, errors.Wrap(err, "like search failed")
	}
	highlights := []string{query}
	hits := make([]Hit, 0, len(results))
	for _, r := range results {
		// Prefer a body snippet around the match; fall back to the title when the
		// term only appears there.
		snippetSource := r.Content
		if !strings.Contains(strings.ToLower(r.Content), strings.ToLower(query)) {
			snippetSource = r.Title
		}
		hits = append(hits, Hit{
			MemoID:      r.MemoID,
			WorkspaceID: r.WorkspaceID,
			FolderPath:  r.FolderPath,
			Score:       1,
			Snippet:     makeSnippet(snippetSource, query),
			Highlights:  highlights,
		})
	}
	return hits, nil
}

// fuseAndDedup merges the two retrieval paths with Reciprocal Rank Fusion. Both
// inputs are already collapsed to one best entry per memo and sorted best-first,
// so each path contributes a single RRF term per document (no long-document bias).
func fuseAndDedup(fts []*store.ChunkFTSResult, vec []scoredChunk, query string, limit int) []Hit {
	type acc struct {
		memoID         int32
		workspaceID    int32
		folderPath     string
		score          float64
		bestContent    string
		hasKeyword     bool    // matched via FTS/substring — always relevant, never trimmed
		bestSimilarity float64 // best cosine similarity for this memo
	}
	byMemo := map[int32]*acc{}
	get := func(memoID int32) *acc {
		a := byMemo[memoID]
		if a == nil {
			a = &acc{memoID: memoID}
			byMemo[memoID] = a
		}
		return a
	}

	// Keyword path. Its content contains the literal match, so it is the preferred
	// snippet source.
	for rank, r := range fts {
		a := get(r.MemoID)
		a.score += 1.0 / float64(rrfK+rank+1)
		a.hasKeyword = true
		a.bestContent = r.Content
	}
	// Semantic path. Only supply content/metadata when the keyword path didn't.
	for rank, r := range vec {
		a := get(r.MemoID)
		a.score += 1.0 / float64(rrfK+rank+1)
		if r.Similarity > a.bestSimilarity {
			a.bestSimilarity = r.Similarity
		}
		if !a.hasKeyword && a.bestContent == "" {
			a.bestContent = r.Content
		}
		if a.workspaceID == 0 && r.WorkspaceID != 0 {
			a.workspaceID = r.WorkspaceID
		}
		if a.folderPath == "" && r.FolderPath != "" {
			a.folderPath = r.FolderPath
		}
	}

	accs := make([]*acc, 0, len(byMemo))
	for _, a := range byMemo {
		// Drop purely-semantic hits whose best similarity is below the noise floor.
		// Keyword (substring) matches are always kept.
		if !a.hasKeyword && a.bestSimilarity < semanticMinSimilarity {
			continue
		}
		accs = append(accs, a)
	}
	sort.Slice(accs, func(i, j int) bool {
		if accs[i].score == accs[j].score {
			return accs[i].memoID < accs[j].memoID
		}
		return accs[i].score > accs[j].score
	})

	// Trim the weak semantic long tail relative to the top hit, so results don't pad up
	// to `limit` with noise. Keyword matches are exempt — a literal match is always shown.
	if len(accs) > 0 {
		threshold := accs[0].score * relativeScoreCutoff
		kept := accs[:0]
		for _, a := range accs {
			if a.hasKeyword || a.score >= threshold {
				kept = append(kept, a)
			}
		}
		accs = kept
	}

	if len(accs) > limit {
		accs = accs[:limit]
	}

	highlights := []string{query}
	hits := make([]Hit, 0, len(accs))
	for _, a := range accs {
		hits = append(hits, Hit{
			MemoID:      a.memoID,
			WorkspaceID: a.workspaceID,
			FolderPath:  a.folderPath,
			Score:       a.score,
			Snippet:     makeSnippet(a.bestContent, query),
			Highlights:  highlights,
		})
	}
	return hits
}

// makeSnippet returns a window of content centered on the first query match.
func makeSnippet(content, query string) string {
	content = strings.TrimSpace(content)
	if utf8.RuneCountInString(content) <= snippetRunes {
		return content
	}
	runes := []rune(content)
	idx := -1
	if lower := strings.ToLower(content); query != "" {
		if b := strings.Index(lower, strings.ToLower(query)); b >= 0 {
			idx = utf8.RuneCountInString(content[:b])
		}
	}
	start := 0
	if idx >= 0 {
		start = idx - snippetRunes/2
		if start < 0 {
			start = 0
		}
	}
	end := start + snippetRunes
	if end > len(runes) {
		end = len(runes)
		start = end - snippetRunes
		if start < 0 {
			start = 0
		}
	}
	snippet := strings.TrimSpace(string(runes[start:end]))
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(runes) {
		snippet += "…"
	}
	return snippet
}
