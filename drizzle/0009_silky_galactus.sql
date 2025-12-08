CREATE TABLE `point_accounts` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`frozen_balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_accounts_id_unique` ON `point_accounts` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `point_accounts_user_id_unique` ON `point_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `point_transactions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`type` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`remark` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_transactions_id_unique` ON `point_transactions` (`id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_id_unique` ON `sessions` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`nickname` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_login_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_id_unique` ON `users` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);