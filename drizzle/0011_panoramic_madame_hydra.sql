DROP INDEX `media_url_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_user_url_idx` ON `media` (`user_id`,`url`);