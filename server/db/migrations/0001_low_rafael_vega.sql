CREATE INDEX `analyses_game_idx` ON `analyses` (`game_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analyses_user_idx` ON `analyses` (`user_id`);--> statement-breakpoint
CREATE INDEX `games_user_idx` ON `games` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `moves_game_ply_idx` ON `moves` (`game_id`,`ply`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);