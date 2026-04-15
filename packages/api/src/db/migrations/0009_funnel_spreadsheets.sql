CREATE TYPE "public"."funnel_spreadsheet_type" AS ENUM('leads', 'sales', 'custom');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "funnel_spreadsheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"label" varchar(255) NOT NULL,
	"type" "funnel_spreadsheet_type" NOT NULL,
	"spreadsheet_id" varchar(255) NOT NULL,
	"spreadsheet_name" varchar(255) NOT NULL,
	"sheet_name" varchar(255) NOT NULL,
	"column_mapping" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funnel_spreadsheets" ADD CONSTRAINT "funnel_spreadsheets_funnel_id_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_spreadsheets" ADD CONSTRAINT "funnel_spreadsheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_funnel_spreadsheets_funnel" ON "funnel_spreadsheets" USING btree ("funnel_id");
