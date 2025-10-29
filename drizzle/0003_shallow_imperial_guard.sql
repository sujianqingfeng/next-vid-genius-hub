CREATE TABLE `channel_videos` (
	`id` text NOT NULL,
	`channel_id` text NOT NULL,
	`video_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`thumbnail` text,
	`published_at` integer,
	`view_count` integer,
	`like_count` integer,
	`raw` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_videos_id_unique` ON `channel_videos` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `channel_videos_video_id_unique` ON `channel_videos` (`video_id`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text NOT NULL,
	`provider` text DEFAULT 'youtube' NOT NULL,
	`channel_url` text NOT NULL,
	`channel_id` text,
	`title` text,
	`thumbnail` text,
	`default_proxy_id` text,
	`last_synced_at` integer,
	`last_sync_status` text,
	`last_job_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_id_unique` ON `channels` (`id`);