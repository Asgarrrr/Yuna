import { index, integer, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "../auth/user";

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").default("piece").notNull(),
    contentAmount: numeric("content_amount", { precision: 10, scale: 2 }),
    contentUnit: text("content_unit"),
    icon: text("icon"),
    barcode: text("barcode"),
    imageUrl: text("image_url"),
    brand: text("brand"),
    genericName: text("generic_name"),
    nutriscoreGrade: text("nutriscore_grade"),
    offId: text("off_id"),
    imageSmallUrl: text("image_small_url"),
    lastPrice: numeric("last_price", { precision: 10, scale: 2 }),
    usageCount: integer("usage_count").default(0).notNull(),
    lastPurchasedAt: timestamp("last_purchased_at"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("product_name_idx").on(table.name),
    index("product_category_idx").on(table.category),
    index("product_barcode_idx").on(table.barcode),
    index("product_usage_count_idx").on(table.usageCount),
  ],
);
