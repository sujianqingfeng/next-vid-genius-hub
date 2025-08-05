ALTER TABLE `media` ADD `video_with_subtitles_path` text;--> statement-breakpoint
ALTER TABLE `media` ADD `video_with_info_path` text;--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `rendered_path`;