import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { product } from "./product";

export const productTag = pgTable(
  "product_tag",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    source: text("source").notNull(), // "system" | "ai" | "user"
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("product_tag_unique").on(table.productId, table.tag),
    index("product_tag_tag_idx").on(table.tag),
    index("product_tag_product_idx").on(table.productId),
  ],
);
