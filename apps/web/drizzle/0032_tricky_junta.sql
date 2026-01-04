CREATE TABLE `agent_chat_messages` (
	`id` text NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`seq` integer NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_chat_messages_session_id_msg_id_idx` ON `agent_chat_messages` (`session_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_chat_messages_session_seq_idx` ON `agent_chat_messages` (`session_id`,`seq`);--> statement-breakpoint
CREATE TABLE `agent_chat_sessions` (
	`id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`model_id` text,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_chat_sessions_id_unique` ON `agent_chat_sessions` (`id`);