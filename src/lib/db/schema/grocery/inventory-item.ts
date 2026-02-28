import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "../auth/user";
import { product } from "./product";

export const inventoryItem = pgTable(
  "inventory_item",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_stock"),
    location: text("location"),
    quantity: integer("quantity"),
    expiresAt: timestamp("expires_at"),
    depletedAt: timestamp("depleted_at"),
    lastPurchasedAt: timestamp("last_purchased_at"),
    addedBy: text("added_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("inventory_product_user_unique").on(table.productId, table.addedBy),
    index("inventory_product_idx").on(table.productId),
    index("inventory_expires_idx").on(table.expiresAt),
    index("inventory_location_idx").on(table.location),
    index("inventory_status_idx").on(table.status),
  ],
);
