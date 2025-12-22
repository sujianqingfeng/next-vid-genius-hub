CREATE TABLE `point_pricing_rules` (
	`id` text NOT NULL,
	`resource_type` text NOT NULL,
	`model_id` text,
	`unit` text NOT NULL,
	`price_per_unit` integer NOT NULL,
	`min_charge` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `point_pricing_rules_id_unique` ON `point_pricing_rules` (`id`);--> statement-breakpoint
ALTER TABLE `point_transactions` ADD `metadata` text;