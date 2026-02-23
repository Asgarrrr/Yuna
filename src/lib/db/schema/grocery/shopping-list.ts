import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "../auth/user";

export const shoppingList = pgTable("shopping_list", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => new Date())
    .notNull()
    .defaultNow(),
});
