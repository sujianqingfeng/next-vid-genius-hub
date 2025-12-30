CREATE TABLE `thread_template_library` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`template_id` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thread_template_library_id_unique` ON `thread_template_library` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_template_library_user_name_idx` ON `thread_template_library` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `thread_template_versions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`library_id` text NOT NULL,
	`version` integer NOT NULL,
	`note` text,
	`source_thread_id` text,
	`template_config` text,
	`template_config_resolved` text,
	`template_config_hash` text,
	`compile_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thread_template_versions_id_unique` ON `thread_template_versions` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_template_versions_library_ver_idx` ON `thread_template_versions` (`library_id`,`version`);