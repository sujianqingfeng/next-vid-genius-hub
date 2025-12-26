CREATE TABLE `thread_assets` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_url` text,
	`storage_key` text,
	`content_type` text,
	`bytes` integer,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`thumbnail_asset_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thread_assets_id_unique` ON `thread_assets` (`id`);--> statement-breakpoint
CREATE TABLE `thread_posts` (
	`id` text NOT NULL,
	`thread_id` text NOT NULL,
	`source_post_id` text,
	`role` text NOT NULL,
	`author_name` text NOT NULL,
	`author_handle` text,
	`author_profile_url` text,
	`author_avatar_asset_id` text,
	`content_blocks` text NOT NULL,
	`plain_text` text NOT NULL,
	`metrics` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`parent_source_post_id` text,
	`raw` text,
	`created_at` integer,
	`edited_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thread_posts_id_unique` ON `thread_posts` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_posts_thread_source_post_id_idx` ON `thread_posts` (`thread_id`,`source_post_id`);--> statement-breakpoint
CREATE TABLE `thread_renders` (
	`id` text NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`job_id` text,
	`template_id` text,
	`template_config` text,
	`input_snapshot_key` text,
	`output_video_key` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thread_renders_id_unique` ON `thread_renders` (`id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`source_url` text,
	`source_id` text,
	`title` text NOT NULL,
	`lang` text,
	`template_id` text,
	`template_config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `threads_id_unique` ON `threads` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `threads_user_source_id_idx` ON `threads` (`user_id`,`source`,`source_id`);