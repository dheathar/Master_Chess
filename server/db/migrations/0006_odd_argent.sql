CREATE TABLE `coach_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`drill_id` text,
	`screen` text,
	`role` text,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `coach_events_user_idx` ON `coach_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `journey_cache` (
	`user_id` text PRIMARY KEY NOT NULL,
	`signature` text NOT NULL,
	`narrative` text NOT NULL,
	`llm_available` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `drill_attempts` ADD `hinted` integer DEFAULT false NOT NULL;