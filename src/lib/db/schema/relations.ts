import { relations } from "drizzle-orm";
import { account } from "./account";
import { invitation } from "./invitation";
import { passkey } from "./passkey";
import { session } from "./session";
import { user } from "./user";

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
