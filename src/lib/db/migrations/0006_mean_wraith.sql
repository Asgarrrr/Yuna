CREATE TABLE IF NOT EXISTS "household" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Mon foyer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "household_member" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "household_member_unique" UNIQUE("household_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT IF EXISTS "inventory_product_unique";--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT IF EXISTS "inventory_product_user_unique";--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN IF NOT EXISTS "household_id" text;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD COLUMN IF NOT EXISTS "household_id" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "household" ADD CONSTRAINT "household_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "household_member" ADD CONSTRAINT "household_member_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "household_member" ADD CONSTRAINT "household_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- Backfill: Create one shared household for all existing users
DO $$
DECLARE
  v_household_id text;
  v_user_id text;
  v_is_first boolean := true;
BEGIN
  IF EXISTS (SELECT 1 FROM "user" LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "household" LIMIT 1) THEN
    v_household_id := gen_random_uuid()::text;

    INSERT INTO "household" ("id", "name", "created_at")
    VALUES (v_household_id, 'Mon foyer', now());

    FOR v_user_id IN
      SELECT id FROM "user" ORDER BY "created_at" ASC
    LOOP
      INSERT INTO "household_member" ("id", "household_id", "user_id", "role", "joined_at")
      VALUES (gen_random_uuid()::text, v_household_id, v_user_id,
        CASE WHEN v_is_first THEN 'owner' ELSE 'member' END, now());
      v_is_first := false;
    END LOOP;

    UPDATE "shopping_list" SET "household_id" = v_household_id WHERE "household_id" IS NULL;
    UPDATE "inventory_item" SET "household_id" = v_household_id WHERE "household_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint

DROP INDEX IF EXISTS "shopping_list_active_user_unique";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inventory_household_idx" ON "inventory_item" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_list_active_household_unique" ON "shopping_list" USING btree ("household_id") WHERE "shopping_list"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sli_list_product_unique" ON "shopping_list_item" USING btree ("list_id","product_id") WHERE "shopping_list_item"."product_id" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_product_household_unique" UNIQUE("product_id","household_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;