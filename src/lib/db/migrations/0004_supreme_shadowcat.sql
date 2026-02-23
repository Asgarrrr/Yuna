CREATE TABLE "inventory_item" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp,
	"location" text,
	"added_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"content_amount" numeric(10, 2),
	"content_unit" text,
	"icon" text,
	"barcode" text,
	"image_url" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_item" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"product_id" text,
	"custom_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list" ADD CONSTRAINT "shopping_list_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_list_id_shopping_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_item" ADD CONSTRAINT "shopping_list_item_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_product_idx" ON "inventory_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "inventory_expires_idx" ON "inventory_item" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "inventory_location_idx" ON "inventory_item" USING btree ("location");--> statement-breakpoint
CREATE INDEX "product_name_idx" ON "product" USING btree ("name");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "product" USING btree ("category");--> statement-breakpoint
CREATE INDEX "product_barcode_idx" ON "product" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "product_usage_count_idx" ON "product" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "sli_list_idx" ON "shopping_list_item" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "sli_product_idx" ON "shopping_list_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sli_checked_idx" ON "shopping_list_item" USING btree ("checked");