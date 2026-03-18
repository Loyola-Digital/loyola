CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'blocked');--> statement-breakpoint
CREATE TABLE "meta_ads_account_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_meta_ads_account_project" UNIQUE("account_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "meta_ads_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_name" varchar(100) NOT NULL,
	"meta_account_id" varchar(50) NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"access_token_iv" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_ads_account_projects" ADD CONSTRAINT "meta_ads_account_projects_account_id_meta_ads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."meta_ads_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads_account_projects" ADD CONSTRAINT "meta_ads_account_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads_accounts" ADD CONSTRAINT "meta_ads_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_meta_ads_account_projects_account" ON "meta_ads_account_projects" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_meta_ads_account_projects_project" ON "meta_ads_account_projects" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_meta_ads_meta_account_id" ON "meta_ads_accounts" USING btree ("meta_account_id");--> statement-breakpoint
CREATE INDEX "idx_meta_ads_created_by" ON "meta_ads_accounts" USING btree ("created_by");