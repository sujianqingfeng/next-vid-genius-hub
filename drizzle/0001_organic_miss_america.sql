ALTER TABLE `downloads` RENAME TO `media`;--> statement-breakpoint
ALTER TABLE `media` RENAME COLUMN "download_url" TO "url";--> statement-breakpoint
DROP INDEX `downloads_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_id_unique` ON `media` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_url_unique` ON `media` (`url`);