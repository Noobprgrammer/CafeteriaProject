CREATE TABLE IF NOT EXISTS "wallet" (
	"student_id" varchar(64) PRIMARY KEY NOT NULL,
	"balance" numeric(10, 2) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
