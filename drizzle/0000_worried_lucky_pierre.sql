CREATE TABLE `downloads` (
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
	`download_url` text NOT NULL,
	`file_path` text,
	`audio_file_path` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `downloads_id_unique` ON `downloads` (`id`);