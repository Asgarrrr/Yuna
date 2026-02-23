import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "../auth/user";
import { product } from "./product";
import { shoppingList } from "./shopping-list";

export const shoppingListItem = pgTable(
  "shopping_list_item",
  {
    id: text("id").primaryKey(),
    listId: text("list_id")
      .notNull()
      .references(() => shoppingList.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, {
      onDelete: "set null",
    }),
    customName: text("custom_name"),
    quantity: integer("quantity").default(1).notNull(),
    unit: text("unit").default("piece").notNull(),
    checked: boolean("checked").default(false).notNull(),
    checkedAt: timestamp("checked_at"),
    sortOrder: integer("sort_order").default(0).notNull(),
    addedBy: text("added_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("sli_list_idx").on(table.listId),
    index("sli_product_idx").on(table.productId),
    index("sli_checked_idx").on(table.checked),
  ],
);
