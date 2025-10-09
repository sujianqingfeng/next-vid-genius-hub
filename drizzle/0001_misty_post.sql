PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_proxies` (
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
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_proxies`("id", "subscription_id", "name", "server", "port", "protocol", "username", "password", "ssr_url", "is_active", "last_tested_at", "test_status", "response_time", "created_at") SELECT "id", "subscription_id", "name", "server", "port", "protocol", "username", "password", "ssr_url", "is_active", "last_tested_at", "test_status", "response_time", "created_at" FROM `proxies`;--> statement-breakpoint
DROP TABLE `proxies`;--> statement-breakpoint
ALTER TABLE `__new_proxies` RENAME TO `proxies`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `proxies_id_unique` ON `proxies` (`id`);