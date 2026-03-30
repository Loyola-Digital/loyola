CREATE TYPE "public"."funnel_type" AS ENUM('launch', 'perpetual');--> statement-breakpoint
CREATE TABLE "funnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "funnel_type" NOT NULL,
	"meta_account_id" uuid,
	"campaign_id" varchar(100),
	"campaign_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_funnels_project_campaign" UNIQUE("project_id","campaign_id")
);
--> statement-breakpoint
ALTER TABLE "funnels" ADD CONSTRAINT "funnels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnels" ADD CONSTRAINT "funnels_meta_account_id_meta_ads_accounts_id_fk" FOREIGN KEY ("meta_account_id") REFERENCES "public"."meta_ads_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_funnels_project" ON "funnels" USING btree ("project_id");