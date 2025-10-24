ALTER TABLE `media` ADD `comments_moderated_at` integer;--> statement-breakpoint
ALTER TABLE `media` ADD `comments_moderation_model` text;--> statement-breakpoint
ALTER TABLE `media` ADD `comments_flagged_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `media` ADD `comments_moderation_summary` text;