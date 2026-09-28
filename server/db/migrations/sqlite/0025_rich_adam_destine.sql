CREATE TABLE `competition_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`competition_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`max_entries_per_person` integer DEFAULT 3 NOT NULL,
	`votes_per_person` integer DEFAULT 2 NOT NULL,
	`votes_per_judge` integer DEFAULT 5 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`competition_id`) REFERENCES `competitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competition_questions_competition_idx` ON `competition_questions` (`competition_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `competition_entries` ADD `question_id` text REFERENCES competition_questions(id);--> statement-breakpoint
CREATE INDEX `competition_entries_question_idx` ON `competition_entries` (`question_id`);--> statement-breakpoint
ALTER TABLE `competition_votes` ADD `question_id` text REFERENCES competition_questions(id);--> statement-breakpoint
CREATE INDEX `competition_votes_voter_question_idx` ON `competition_votes` (`participant_id`,`question_id`);--> statement-breakpoint
-- Backfill: every competition that already exists gets one question carrying
-- its old competition-wide limits, and its entries and votes move onto it.
INSERT INTO `competition_questions` (`id`, `competition_id`, `title`, `sort_order`, `max_entries_per_person`, `votes_per_person`, `votes_per_judge`)
SELECT `id` || '-q1', `id`, `title`, 0, `max_entries_per_person`, `votes_per_person`, `votes_per_judge` FROM `competitions`;--> statement-breakpoint
UPDATE `competition_entries` SET `question_id` = `competition_id` || '-q1' WHERE `question_id` IS NULL;--> statement-breakpoint
UPDATE `competition_votes` SET `question_id` = `competition_id` || '-q1' WHERE `question_id` IS NULL;
