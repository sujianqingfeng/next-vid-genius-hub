CREATE TABLE `proxy_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`proxy_check_test_url` text,
	`proxy_check_timeout_ms` integer,
	`proxy_check_probe_bytes` integer,
	`proxy_check_concurrency` integer,
	`updated_at` integer NOT NULL
);
