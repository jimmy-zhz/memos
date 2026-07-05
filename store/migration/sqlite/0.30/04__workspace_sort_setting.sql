ALTER TABLE workspace ADD COLUMN sort_field TEXT NOT NULL DEFAULT 'createTime';
ALTER TABLE workspace ADD COLUMN sort_order TEXT NOT NULL DEFAULT 'desc';
