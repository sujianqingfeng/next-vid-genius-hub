CREATE TABLE `agent_actions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`params` text,
	`estimate` text,
	`result` text,
	`error` text,
	`confirmed_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_actions_id_unique` ON `agent_actions` (`id`);