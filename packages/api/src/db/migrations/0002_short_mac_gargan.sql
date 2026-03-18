CREATE TABLE "instagram_account_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ig_account_project" UNIQUE("account_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "instagram_accounts" DROP CONSTRAINT "instagram_accounts_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "idx_ig_accounts_project";--> statement-breakpoint
ALTER TABLE "instagram_account_projects" ADD CONSTRAINT "instagram_account_projects_account_id_instagram_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."instagram_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_account_projects" ADD CONSTRAINT "instagram_account_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ig_account_projects_account" ON "instagram_account_projects" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_ig_account_projects_project" ON "instagram_account_projects" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "instagram_accounts" DROP COLUMN "project_id";