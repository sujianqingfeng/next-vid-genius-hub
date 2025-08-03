CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`author_thumbnail` text,
	`content` text NOT NULL,
	`translated_content` text,
	`likes` integer DEFAULT 0,
	`reply_count` integer DEFAULT 0,
	`media_id` text,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE no action
);
