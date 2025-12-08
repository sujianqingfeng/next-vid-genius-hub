CREATE TABLE `tasks` (
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`engine` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`job_id` text,
	`status` text,
	`progress` integer,
	`error` text,
	`job_status_snapshot` text,
	`payload` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_id_unique` ON `tasks` (`id`);