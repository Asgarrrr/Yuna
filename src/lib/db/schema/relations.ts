import { relations } from "drizzle-orm";
import { account } from "./auth/account";
import { invitation } from "./auth/invitation";
import { passkey } from "./auth/passkey";
import { session } from "./auth/session";
import { user } from "./auth/user";
import { inventoryItem } from "./grocery/inventory-item";
import { product } from "./grocery/product";
import { purchaseHistory } from "./grocery/purchase-history";
import { shoppingList } from "./grocery/shopping-list";
import { shoppingListItem } from "./grocery/shopping-list-item";

// ── Auth relations ──────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  passkeys: many(passkey),
  createdInvitations: many(invitation, { relationName: "createdBy" }),
  usedInvitation: many(invitation, { relationName: "usedBy" }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  createdBy: one(user, {
    fields: [invitation.createdBy],
    references: [user.id],
    relationName: "createdBy",
  }),
  usedBy: one(user, {
    fields: [invitation.usedBy],
    references: [user.id],
    relationName: "usedBy",
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
  user: one(user, {
    fields: [passkey.userId],
    references: [user.id],
  }),
}));

// ── Grocery relations ───────────────────────────────────

export const productRelations = relations(product, ({ many, one }) => ({
  inventoryItems: many(inventoryItem),
  shoppingListItems: many(shoppingListItem),
  purchaseHistory: many(purchaseHistory),
  createdBy: one(user, {
    fields: [product.createdBy],
    references: [user.id],
  }),
}));

export const shoppingListRelations = relations(shoppingList, ({ many, one }) => ({
  items: many(shoppingListItem),
  createdBy: one(user, {
    fields: [shoppingList.createdBy],
    references: [user.id],
  }),
}));

export const shoppingListItemRelations = relations(shoppingListItem, ({ one }) => ({
  list: one(shoppingList, {
    fields: [shoppingListItem.listId],
    references: [shoppingList.id],
  }),
  product: one(product, {
    fields: [shoppingListItem.productId],
    references: [product.id],
  }),
  addedBy: one(user, {
    fields: [shoppingListItem.addedBy],
    references: [user.id],
  }),
}));

export const inventoryItemRelations = relations(inventoryItem, ({ one }) => ({
  product: one(product, {
    fields: [inventoryItem.productId],
    references: [product.id],
  }),
  addedBy: one(user, {
    fields: [inventoryItem.addedBy],
    references: [user.id],
  }),
}));

export const purchaseHistoryRelations = relations(purchaseHistory, ({ one }) => ({
  product: one(product, {
    fields: [purchaseHistory.productId],
    references: [product.id],
  }),
  recordedBy: one(user, {
    fields: [purchaseHistory.recordedBy],
    references: [user.id],
  }),
}));
