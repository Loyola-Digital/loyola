CREATE TABLE "google_sheets_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"spreadsheet_id" varchar(200) NOT NULL,
	"spreadsheet_url" text NOT NULL,
	"spreadsheet_name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_sheets_tab_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"tab_name" varchar(200) NOT NULL,
	"tab_type" varchar(50) NOT NULL,
	"column_mapping" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_gsheets_tab_connection_name" UNIQUE("connection_id","tab_name")
);
--> statement-breakpoint
ALTER TABLE "google_sheets_connections" ADD CONSTRAINT "google_sheets_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sheets_connections" ADD CONSTRAINT "google_sheets_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sheets_tab_mappings" ADD CONSTRAINT "google_sheets_tab_mappings_connection_id_google_sheets_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_sheets_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gsheets_project" ON "google_sheets_connections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_gsheets_created_by" ON "google_sheets_connections" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_gsheets_tab_connection" ON "google_sheets_tab_mappings" USING btree ("connection_id");