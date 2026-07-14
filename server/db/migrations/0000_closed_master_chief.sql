CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`engine_depth` integer NOT NULL,
	`summary_json` text,
	`llm_narrative_json` text,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`detail_json` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coach_students` (
	`coach_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	PRIMARY KEY(`coach_id`, `student_id`),
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dossiers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`opponent_name` text NOT NULL,
	`source_game_ids_json` text NOT NULL,
	`report_json` text,
	`error_model_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drill_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`drill_id` text NOT NULL,
	`user_id` text NOT NULL,
	`answered_uci` text,
	`correct` integer NOT NULL,
	`ms_taken` integer,
	`eval_prediction_cp` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`drill_id`) REFERENCES `drills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_move_id` text,
	`fen` text NOT NULL,
	`correct_uci` text NOT NULL,
	`skill_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_from_analysis_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_move_id`) REFERENCES `moves`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `eval_cache` (
	`fen_key` text NOT NULL,
	`depth` integer NOT NULL,
	`multipv` integer NOT NULL,
	`engine_version` text NOT NULL,
	`best_move` text,
	`lines_json` text NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`fen_key`, `depth`, `multipv`, `engine_version`)
);
--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`skill_score_id` text NOT NULL,
	`move_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`direction` text NOT NULL,
	`weight` integer NOT NULL,
	`rule_id` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`skill_score_id`) REFERENCES `skill_scores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`move_id`) REFERENCES `moves`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`pgn_raw` text NOT NULL,
	`white` text NOT NULL,
	`black` text NOT NULL,
	`white_elo` integer,
	`black_elo` integer,
	`player_color` text,
	`result` text,
	`time_control` text,
	`played_at` text,
	`opening_eco` text,
	`opening_name` text,
	`ply_count` integer DEFAULT 0 NOT NULL,
	`import_batch_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `moves` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`ply` integer NOT NULL,
	`san` text NOT NULL,
	`uci` text NOT NULL,
	`fen_before` text NOT NULL,
	`fen_after` text NOT NULL,
	`color` text NOT NULL,
	`clock_ms` integer,
	`move_time_ms` integer,
	`phase` text,
	`eval_cp_before` integer,
	`eval_cp_after` integer,
	`cp_loss` integer,
	`classification` text,
	`best_move_uci` text,
	`best_move_san` text,
	`multipv_json` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `player_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`skill_vector_json` text NOT NULL,
	`level` text NOT NULL,
	`plateau_diagnosis` text,
	`confidence` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`plan_json` text NOT NULL,
	`source_snapshot_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`drill_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`ease` integer NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`drill_id`) REFERENCES `drills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_hash` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skill_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`category` text NOT NULL,
	`p_know` integer NOT NULL,
	`mastery` integer NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`trend` text DEFAULT 'flat' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `training_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plateau` text NOT NULL,
	`week_plan_json` text NOT NULL,
	`started_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`subject_key` text NOT NULL,
	`day` text NOT NULL,
	`analyses_used` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`subject_key`, `day`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'player' NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);