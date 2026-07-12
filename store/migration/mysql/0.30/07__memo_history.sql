CREATE TABLE `memo_history` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `memo_id` INT NOT NULL,
  `name` VARCHAR(256) NOT NULL DEFAULT '',
  `title` VARCHAR(256) NOT NULL DEFAULT '',
  `content` TEXT NOT NULL,
  `payload` JSON NOT NULL,
  `content_hash` VARCHAR(128) NOT NULL DEFAULT '',
  `attachments` JSON NOT NULL,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT 0,
  INDEX `idx_memo_history_memo_id` (`memo_id`, `created_ts`)
);
