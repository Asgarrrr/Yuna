import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  email: text("email"),
  createdBy: text("created_by").references(() => user.id),
  usedBy: text("used_by").references(() => user.id),
  usedAt: timestamp("used_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
