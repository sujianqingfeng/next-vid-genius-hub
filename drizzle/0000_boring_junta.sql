CREATE TABLE `media` (
	`id` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`source` text NOT NULL,
	`quality` text NOT NULL,
	`thumbnail` text,
	`view_count` integer DEFAULT 0,
	`like_count` integer DEFAULT 0,
	`comment_count` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`url` text NOT NULL,
	`file_path` text,
	`audio_file_path` text,
	`transcription` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_id_unique` ON `media` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_url_unique` ON `media` (`url`);