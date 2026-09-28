CREATE TABLE `competition_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`title` text,
	`r2_key` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `competition_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_entries_competition_idx` ON `competition_entries` (`competition_id`);--> statement-breakpoint
CREATE INDEX `competition_entries_key_idx` ON `competition_entries` (`r2_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `competition_entries_participant_key_unq` ON `competition_entries` (`participant_id`,`r2_key`);--> statement-breakpoint
CREATE TABLE `competition_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`role` text DEFAULT 'attendee' NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`group_name` text,
	`code_hash` text,
	`judge_code` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_participants_competition_idx` ON `competition_participants` (`competition_id`);--> statement-breakpoint
CREATE INDEX `competition_participants_code_idx` ON `competition_participants` (`competition_id`,`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `competition_participants_phone_unq` ON `competition_participants` (`competition_id`,`phone`);--> statement-breakpoint
CREATE TABLE `competition_votes` (
	`competition_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`participant_id`, `entry_id`),
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `competition_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `competition_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_votes_competition_idx` ON `competition_votes` (`competition_id`);--> statement-breakpoint
CREATE INDEX `competition_votes_entry_idx` ON `competition_votes` (`entry_id`);--> statement-breakpoint
CREATE TABLE `competitions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`access_mode` text DEFAULT 'roster' NOT NULL,
	`access_code` text,
	`scoring` text DEFAULT 'public' NOT NULL,
	`public_weight` integer DEFAULT 1 NOT NULL,
	`judge_weight` integer DEFAULT 1 NOT NULL,
	`max_entries_per_person` integer DEFAULT 3 NOT NULL,
	`votes_per_person` integer DEFAULT 2 NOT NULL,
	`votes_per_judge` integer DEFAULT 5 NOT NULL,
	`max_bytes_per_photo` integer DEFAULT 15728640 NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
