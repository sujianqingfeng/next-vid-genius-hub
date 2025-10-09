CREATE TABLE `media` (
	`id` text NOT NULL,
	`title` text NOT NULL,
	`translated_title` text,
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
	`transcription` text,
	`transcription_words` text,
	`translation` text,
	`video_with_subtitles_path` text,
	`video_with_info_path` text,
	`comments` text,
	`comments_downloaded_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_id_unique` ON `media` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_url_unique` ON `media` (`url`);--> statement-breakpoint
CREATE TABLE `proxies` (
	`id` text NOT NULL,
	`subscription_id` text,
	`name` text,
	`server` text NOT NULL,
	`port` integer NOT NULL,
	`protocol` text NOT NULL,
	`username` text,
	`password` text,
	`ssr_url` text NOT NULL,
	`is_active` integer DEFAULT false,
	`last_tested_at` integer,
	`test_status` text DEFAULT 'pending',
	`response_time` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `ssr_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proxies_id_unique` ON `proxies` (`id`);--> statement-breakpoint
CREATE TABLE `ssr_subscriptions` (
	`id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`is_active` integer DEFAULT false,
	`last_updated` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ssr_subscriptions_id_unique` ON `ssr_subscriptions` (`id`);