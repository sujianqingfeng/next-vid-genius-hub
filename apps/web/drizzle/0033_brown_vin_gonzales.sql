ALTER TABLE `point_pricing_rules` ADD `pricing_mode` text;--> statement-breakpoint
ALTER TABLE `point_pricing_rules` ADD `markup_bps` integer;--> statement-breakpoint
ALTER TABLE `point_pricing_rules` ADD `cost_input_fen_per_1m` integer;--> statement-breakpoint
ALTER TABLE `point_pricing_rules` ADD `cost_output_fen_per_1m` integer;--> statement-breakpoint
ALTER TABLE `point_pricing_rules` ADD `cost_fen_per_minute` integer;--> statement-breakpoint
ALTER TABLE `point_pricing_rules` ADD `min_charge_cost_fen` integer;