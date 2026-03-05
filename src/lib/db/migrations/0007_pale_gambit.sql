ALTER TABLE "inventory_item" DROP CONSTRAINT IF EXISTS "inventory_product_household_unique";--> statement-breakpoint
ALTER TABLE "inventory_item" DROP CONSTRAINT IF EXISTS "inventory_item_household_id_household_id_fk";--> statement-breakpoint
ALTER TABLE "shopping_list" DROP CONSTRAINT IF EXISTS "shopping_list_household_id_household_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_household_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "shopping_list_active_household_unique";--> statement-breakpoint
ALTER TABLE "inventory_item" DROP COLUMN IF EXISTS "household_id";--> statement-breakpoint
ALTER TABLE "shopping_list" DROP COLUMN IF EXISTS "household_id";--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_product_unique" UNIQUE("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_list_single_active" ON "shopping_list" USING btree ("is_active") WHERE "shopping_list"."is_active" = true;--> statement-breakpoint
ALTER TABLE "household" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "household_member" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "household_member" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "household" CASCADE;