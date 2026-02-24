import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../auth/user";
import { product } from "./product";

export const purchaseHistory = pgTable(
  "purchase_history",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
    price: numeric("price", { precision: 10, scale: 2 }),
    storeName: text("store_name"),
    quantity: integer("quantity").notNull().default(1),
    source: text("source").notNull(), // "receipt" | "list_check" | "barcode" | "manual"
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("purchase_history_product_date_idx").on(
      table.productId,
      table.purchasedAt,
    ),
    index("purchase_history_recorded_by_idx").on(table.recordedBy),
  ],
);
