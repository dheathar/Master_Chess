ALTER TABLE `games` ADD `pgn_hash` text;--> statement-breakpoint
CREATE INDEX `games_user_pgn_hash_idx` ON `games` (`user_id`,`pgn_hash`);