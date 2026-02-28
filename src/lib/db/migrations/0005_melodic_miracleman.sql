CREATE TABLE "product_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"tag" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_tag_unique" UNIQUE("product_id","tag")
);
--> statement-breakpoint
CREATE TABLE "purchase_history" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"price" numeric(10, 2),
	"store_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"source" text NOT NULL,
	"recorded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_code_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"raw_code" text NOT NULL,
	"store_name" text,
	"product_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "product_barcode_idx";--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "quantity" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "inventory_item" ALTER COLUMN "quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "status" text DEFAULT 'in_stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "depleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "last_purchased_at" timestamp;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "brand" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "generic_name" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "nutriscore_grade" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "off_id" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "image_small_url" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "last_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "last_purchased_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_tag" ADD CONSTRAINT "product_tag_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_history" ADD CONSTRAINT "purchase_history_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_history" ADD CONSTRAINT "purchase_history_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_code_mapping" ADD CONSTRAINT "receipt_code_mapping_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_code_mapping" ADD CONSTRAINT "receipt_code_mapping_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_tag_tag_idx" ON "product_tag" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "product_tag_product_idx" ON "product_tag" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_history_product_date_idx" ON "purchase_history" USING btree ("product_id","purchased_at");--> statement-breakpoint
CREATE INDEX "purchase_history_recorded_by_idx" ON "purchase_history" USING btree ("recorded_by");--> statement-breakpoint
CREATE INDEX "rcm_raw_code_idx" ON "receipt_code_mapping" USING btree ("raw_code");--> statement-breakpoint
CREATE INDEX "rcm_store_name_idx" ON "receipt_code_mapping" USING btree ("store_name");--> statement-breakpoint
CREATE UNIQUE INDEX "rcm_raw_code_store_idx" ON "receipt_code_mapping" USING btree ("raw_code","store_name");--> statement-breakpoint
CREATE INDEX "inventory_status_idx" ON "inventory_item" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_barcode_idx" ON "product" USING btree ("barcode");--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_product_unique" UNIQUE("product_id");