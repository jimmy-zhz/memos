package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/usememos/memos/store"
)

func (d *DB) ReplaceMemoChunks(ctx context.Context, memoID int32, chunks []*store.MemoChunk) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if err := deleteMemoChunksTx(ctx, tx, memoID); err != nil {
		return err
	}
	for _, chunk := range chunks {
		var embedding any
		if len(chunk.Embedding) > 0 {
			embedding = store.EncodeEmbedding(chunk.Embedding)
			chunk.EmbeddingDim = int32(len(chunk.Embedding))
		}
		stmt := "INSERT INTO `memo_chunk` (`memo_id`, `workspace_id`, `folder_path`, `chunk_index`, `content`, `embedding`, `embedding_model`, `embedding_dim`) " +
			"VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING `id`, `created_ts`, `updated_ts`"
		if err := tx.QueryRowContext(ctx, stmt,
			memoID, chunk.WorkspaceID, chunk.FolderPath, chunk.ChunkIndex, chunk.Content, embedding, chunk.EmbeddingModel, chunk.EmbeddingDim,
		).Scan(&chunk.ID, &chunk.CreatedTs, &chunk.UpdatedTs); err != nil {
			return err
		}
		chunk.MemoID = memoID
		// Keep the FTS index in sync; rowid mirrors memo_chunk.id.
		if _, err := tx.ExecContext(ctx, "INSERT INTO `memo_chunk_fts` (`rowid`, `content`) VALUES (?, ?)", chunk.ID, chunk.Content); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) DeleteMemoChunks(ctx context.Context, memoID int32) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := deleteMemoChunksTx(ctx, tx, memoID); err != nil {
		return err
	}
	return tx.Commit()
}

// deleteMemoChunksTx removes a memo's chunks and their FTS rows within a transaction.
func deleteMemoChunksTx(ctx context.Context, tx *sql.Tx, memoID int32) error {
	rows, err := tx.QueryContext(ctx, "SELECT `id` FROM `memo_chunk` WHERE `memo_id` = ?", memoID)
	if err != nil {
		return err
	}
	ids := []int32{}
	for rows.Next() {
		var id int32
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, id := range ids {
		if _, err := tx.ExecContext(ctx, "DELETE FROM `memo_chunk_fts` WHERE `rowid` = ?", id); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM `memo_chunk` WHERE `memo_id` = ?", memoID); err != nil {
		return err
	}
	return nil
}

func (d *DB) ListMemoChunks(ctx context.Context, find *store.FindMemoChunk) ([]*store.MemoChunk, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.MemoID != nil {
		where, args = append(where, "`memo_id` = ?"), append(args, *find.MemoID)
	}
	if find.WorkspaceID != nil {
		where, args = append(where, "`workspace_id` = ?"), append(args, *find.WorkspaceID)
	}
	if find.HasEmbedding != nil {
		if *find.HasEmbedding {
			where = append(where, "`embedding` IS NOT NULL")
		} else {
			where = append(where, "`embedding` IS NULL")
		}
	}
	if find.MemoIDs != nil {
		if len(find.MemoIDs) == 0 {
			return []*store.MemoChunk{}, nil
		}
		placeholders := make([]string, 0, len(find.MemoIDs))
		for _, id := range find.MemoIDs {
			placeholders = append(placeholders, "?")
			args = append(args, id)
		}
		where = append(where, "`memo_id` IN ("+strings.Join(placeholders, ",")+")")
	}

	query := "SELECT `id`, `memo_id`, `workspace_id`, `folder_path`, `chunk_index`, `content`, `embedding`, `embedding_model`, `embedding_dim`, `created_ts`, `updated_ts` " +
		"FROM `memo_chunk` WHERE " + strings.Join(where, " AND ") + " ORDER BY `memo_id`, `chunk_index`"

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*store.MemoChunk{}
	for rows.Next() {
		chunk := &store.MemoChunk{}
		var embedding []byte
		if err := rows.Scan(
			&chunk.ID, &chunk.MemoID, &chunk.WorkspaceID, &chunk.FolderPath, &chunk.ChunkIndex,
			&chunk.Content, &embedding, &chunk.EmbeddingModel, &chunk.EmbeddingDim, &chunk.CreatedTs, &chunk.UpdatedTs,
		); err != nil {
			return nil, err
		}
		chunk.Embedding = store.DecodeEmbedding(embedding)
		list = append(list, chunk)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

// minTrigramRunes is the shortest term the FTS5 trigram tokenizer can match.
// Shorter terms (e.g. 2-character CJK words) are handled via a LIKE fallback so
// they still contribute keyword recall.
const minTrigramRunes = 3

func (d *DB) SearchMemoChunksFTS(ctx context.Context, query *store.ChunkFTSQuery) ([]*store.ChunkFTSResult, error) {
	// Tokenize the query so multiple words are matched independently (AND) rather
	// than as one literal phrase — otherwise word order or intervening text defeats
	// the match. Terms long enough for the trigram tokenizer go through FTS5 MATCH;
	// shorter terms fall back to a literal LIKE so they still narrow results.
	var ftsTerms, likeTerms []string
	for _, term := range strings.Fields(query.Query) {
		if utf8.RuneCountInString(term) >= minTrigramRunes {
			ftsTerms = append(ftsTerms, term)
		} else {
			likeTerms = append(likeTerms, term)
		}
	}
	if len(ftsTerms) == 0 && len(likeTerms) == 0 {
		return []*store.ChunkFTSResult{}, nil
	}

	where, args := []string{}, []any{}
	if len(ftsTerms) > 0 {
		// Each term is quoted so it is treated as a literal substring, then ANDed.
		quoted := make([]string, 0, len(ftsTerms))
		for _, term := range ftsTerms {
			quoted = append(quoted, `"`+strings.ReplaceAll(term, `"`, `""`)+`"`)
		}
		where, args = append(where, "`memo_chunk_fts` MATCH ?"), append(args, strings.Join(quoted, " AND "))
	}
	for _, term := range likeTerms {
		where, args = append(where, "`c`.`content` LIKE ? ESCAPE '\\'"), append(args, "%"+escapeLike(term)+"%")
	}
	if query.WorkspaceID != nil {
		where, args = append(where, "`c`.`workspace_id` = ?"), append(args, *query.WorkspaceID)
	}
	if query.MemoIDs != nil {
		if len(query.MemoIDs) == 0 {
			return []*store.ChunkFTSResult{}, nil
		}
		placeholders := make([]string, 0, len(query.MemoIDs))
		for _, id := range query.MemoIDs {
			placeholders = append(placeholders, "?")
			args = append(args, id)
		}
		where = append(where, "`c`.`memo_id` IN ("+strings.Join(placeholders, ",")+")")
	}

	// Ranking differs by path: an FTS MATCH yields bm25 (lower is better); a pure LIKE
	// query has no relevance signal, so order by recency. bm25() may only be used
	// directly in the query that owns the MATCH (not inside an aggregate or subquery),
	// so we rank at chunk granularity here and collapse to the best chunk per memo in
	// Go below — that way `Limit` bounds the number of distinct documents, not chunks,
	// and a long document can't crowd others out of the candidate pool.
	whereClause := strings.Join(where, " AND ")
	var sqlStr string
	if len(ftsTerms) > 0 {
		sqlStr = "SELECT `c`.`id`, `c`.`memo_id`, `c`.`content`, bm25(`memo_chunk_fts`) AS `rank` " +
			"FROM `memo_chunk_fts` JOIN `memo_chunk` `c` ON `c`.`id` = `memo_chunk_fts`.`rowid` WHERE " + whereClause + " ORDER BY `rank`"
	} else {
		sqlStr = "SELECT `c`.`id`, `c`.`memo_id`, `c`.`content`, 0 AS `rank` FROM `memo_chunk` `c` WHERE " + whereClause +
			" ORDER BY `c`.`updated_ts` DESC"
	}
	// Over-fetch chunks relative to the document limit so the per-memo collapse still has
	// enough distinct documents to fill it, while keeping the scan bounded.
	if query.Limit > 0 {
		sqlStr = fmt.Sprintf("%s LIMIT %d", sqlStr, query.Limit*chunkFetchFanout)
	}

	rows, err := d.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Collapse to the first (best-ranked) chunk per memo, preserving order, up to Limit docs.
	list := []*store.ChunkFTSResult{}
	seen := map[int32]bool{}
	for rows.Next() {
		result := &store.ChunkFTSResult{}
		if err := rows.Scan(&result.ChunkID, &result.MemoID, &result.Content, &result.Rank); err != nil {
			return nil, err
		}
		if seen[result.MemoID] {
			continue
		}
		seen[result.MemoID] = true
		list = append(list, result)
		if query.Limit > 0 && len(list) >= query.Limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

// chunkFetchFanout is how many chunk rows to fetch per requested document, so the
// per-memo collapse has enough distinct documents to satisfy the limit.
const chunkFetchFanout = 10

func (d *DB) SearchMemosLike(ctx context.Context, query *store.MemoLikeQuery) ([]*store.MemoLikeResult, error) {
	// Escape LIKE wildcards in user input so they are matched literally.
	pattern := "%" + escapeLike(query.Query) + "%"
	where := []string{"(`title` LIKE ? ESCAPE '\\' OR `content` LIKE ? ESCAPE '\\')"}
	args := []any{pattern, pattern}
	if query.MemoIDs != nil {
		if len(query.MemoIDs) == 0 {
			return []*store.MemoLikeResult{}, nil
		}
		placeholders := make([]string, 0, len(query.MemoIDs))
		for _, id := range query.MemoIDs {
			placeholders = append(placeholders, "?")
			args = append(args, id)
		}
		where = append(where, "`id` IN ("+strings.Join(placeholders, ",")+")")
	}

	sqlStr := "SELECT `id`, `workspace_id`, `folder_path`, `title`, `content` FROM `memo` WHERE " +
		strings.Join(where, " AND ") + " ORDER BY `updated_ts` DESC"
	if query.Limit > 0 {
		sqlStr = fmt.Sprintf("%s LIMIT %d", sqlStr, query.Limit)
	}

	rows, err := d.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*store.MemoLikeResult{}
	for rows.Next() {
		result := &store.MemoLikeResult{}
		if err := rows.Scan(&result.MemoID, &result.WorkspaceID, &result.FolderPath, &result.Title, &result.Content); err != nil {
			return nil, err
		}
		list = append(list, result)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) UpsertMemoIndexJob(ctx context.Context, memoID int32, reason string) error {
	stmt := "INSERT INTO `memo_index_job` (`memo_id`, `status`, `reason`, `attempts`, `last_error`, `updated_ts`) " +
		"VALUES (?, 'pending', ?, 0, '', strftime('%s','now')) " +
		"ON CONFLICT(`memo_id`) DO UPDATE SET `status` = 'pending', `reason` = excluded.`reason`, `attempts` = 0, `last_error` = '', `updated_ts` = strftime('%s','now')"
	_, err := d.db.ExecContext(ctx, stmt, memoID, reason)
	return err
}

func (d *DB) ListMemoIndexJobs(ctx context.Context, find *store.FindMemoIndexJob) ([]*store.MemoIndexJob, error) {
	where, args := []string{"1 = 1"}, []any{}
	if find.MemoID != nil {
		where, args = append(where, "`memo_id` = ?"), append(args, *find.MemoID)
	}
	if find.Status != nil {
		where, args = append(where, "`status` = ?"), append(args, *find.Status)
	}
	query := "SELECT `memo_id`, `status`, `reason`, `attempts`, `last_error`, `created_ts`, `updated_ts` FROM `memo_index_job` WHERE " +
		strings.Join(where, " AND ") + " ORDER BY `updated_ts`, `memo_id`"
	if find.Limit != nil {
		query = fmt.Sprintf("%s LIMIT %d", query, *find.Limit)
	}

	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []*store.MemoIndexJob{}
	for rows.Next() {
		job := &store.MemoIndexJob{}
		if err := rows.Scan(&job.MemoID, &job.Status, &job.Reason, &job.Attempts, &job.LastError, &job.CreatedTs, &job.UpdatedTs); err != nil {
			return nil, err
		}
		list = append(list, job)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, nil
}

func (d *DB) UpdateMemoIndexJob(ctx context.Context, update *store.UpdateMemoIndexJob) error {
	set, args := []string{"`updated_ts` = strftime('%s','now')"}, []any{}
	if update.Status != nil {
		set, args = append(set, "`status` = ?"), append(args, *update.Status)
	}
	if update.Attempts != nil {
		set, args = append(set, "`attempts` = ?"), append(args, *update.Attempts)
	}
	if update.LastError != nil {
		set, args = append(set, "`last_error` = ?"), append(args, *update.LastError)
	}
	args = append(args, update.MemoID)
	stmt := "UPDATE `memo_index_job` SET " + strings.Join(set, ", ") + " WHERE `memo_id` = ?"
	_, err := d.db.ExecContext(ctx, stmt, args...)
	return err
}

func (d *DB) DeleteMemoIndexJob(ctx context.Context, memoID int32) error {
	_, err := d.db.ExecContext(ctx, "DELETE FROM `memo_index_job` WHERE `memo_id` = ?", memoID)
	return err
}

func (d *DB) CountMemoIndexJobsByStatus(ctx context.Context) (map[string]int, error) {
	rows, err := d.db.QueryContext(ctx, "SELECT `status`, COUNT(*) FROM `memo_index_job` GROUP BY `status`")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		counts[status] = count
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return counts, nil
}
