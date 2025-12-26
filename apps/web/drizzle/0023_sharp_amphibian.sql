CREATE TABLE `job_events` (
	`id` text NOT NULL,
	`event_key` text NOT NULL,
	`kind` text NOT NULL,
	`job_id` text NOT NULL,
	`task_id` text,
	`purpose` text,
	`status` text,
	`source` text NOT NULL,
	`event_seq` integer,
	`event_id` text,
	`event_ts` integer,
	`message` text,
	`payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_events_id_unique` ON `job_events` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_events_event_key_idx` ON `job_events` (`event_key`);