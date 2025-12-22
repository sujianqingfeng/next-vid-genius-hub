CREATE TABLE `ai_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`kind` text NOT NULL,
	`remote_model_id` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`capabilities` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_models_provider_remote_idx` ON `ai_models` (`provider_id`,`remote_model_id`);--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text,
	`api_key` text,
	`enabled` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_providers_id_unique` ON `ai_providers` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_providers_slug_idx` ON `ai_providers` (`slug`);