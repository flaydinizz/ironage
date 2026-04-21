CREATE TABLE `global_economy` (
	`id` text PRIMARY KEY NOT NULL,
	`item_type` text NOT NULL,
	`base_price` real NOT NULL,
	`current_price` real NOT NULL,
	`stock_quantity` integer DEFAULT 0 NOT NULL,
	`sold_since_reset` integer DEFAULT 0 NOT NULL,
	`bought_since_reset` integer DEFAULT 0 NOT NULL,
	`last_price_update` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`currency` real DEFAULT 0 NOT NULL,
	`total_playtime_seconds` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login` integer,
	`active_session_id` text
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`skills_data` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stash` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`items` text NOT NULL,
	`weight_limit` real DEFAULT 500 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_economy_item_type_unique` ON `global_economy` (`item_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_username_unique` ON `players` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `skills_player_id_unique` ON `skills` (`player_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stash_player_id_unique` ON `stash` (`player_id`);