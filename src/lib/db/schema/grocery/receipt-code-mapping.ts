import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "../auth/user";
import { product } from "./product";

export const receiptCodeMapping = pgTable(
  "receipt_code_mapping",
  {
    id: text("id").primaryKey(),
    rawCode: text("raw_code").notNull(),
    storeName: text("store_name"),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rcm_raw_code_idx").on(table.rawCode),
    index("rcm_store_name_idx").on(table.storeName),
    uniqueIndex("rcm_raw_code_store_idx").on(table.rawCode, table.storeName),
  ],
);
