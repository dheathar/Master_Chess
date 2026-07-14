CREATE TABLE `library_games` (
	`id` text PRIMARY KEY NOT NULL,
	`white` text NOT NULL,
	`black` text NOT NULL,
	`white_elo` integer,
	`black_elo` integer,
	`result` text NOT NULL,
	`eco` text,
	`opening` text,
	`event` text,
	`played_at` text,
	`source` text NOT NULL,
	`san_moves` text NOT NULL,
	`ply_count` integer NOT NULL,
	`dedupe_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_games_dedupe_hash_unique` ON `library_games` (`dedupe_hash`);--> statement-breakpoint
CREATE INDEX `library_games_eco_idx` ON `library_games` (`eco`);--> statement-breakpoint
CREATE INDEX `library_games_white_idx` ON `library_games` (`white`);--> statement-breakpoint
CREATE INDEX `library_games_black_idx` ON `library_games` (`black`);--> statement-breakpoint
CREATE TABLE `library_positions` (
	`fen_key` text NOT NULL,
	`san` text NOT NULL,
	`uci` text NOT NULL,
	`white_wins` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`black_wins` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sample_game_id` text NOT NULL,
	PRIMARY KEY(`fen_key`, `san`)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_player_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`skill_vector_json` text NOT NULL,
	`level` text,
	`plateau_diagnosis` text,
	`confidence` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_player_snapshots`("id", "user_id", "taken_at", "skill_vector_json", "level", "plateau_diagnosis", "confidence") SELECT "id", "user_id", "taken_at", "skill_vector_json", "level", "plateau_diagnosis", "confidence" FROM `player_snapshots`;--> statement-breakpoint
DROP TABLE `player_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_player_snapshots` RENAME TO `player_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `player_snapshots_user_idx` ON `player_snapshots` (`user_id`,`taken_at`);--> statement-breakpoint
CREATE INDEX `evidence_skill_score_idx` ON `evidence` (`skill_score_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `moves_fen_before_idx` ON `moves` (`fen_before`);--> statement-breakpoint
CREATE UNIQUE INDEX `skill_scores_user_skill_unique` ON `skill_scores` (`user_id`,`skill_id`);