import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { eq, and, isNull, gt } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [passkey(), nextCookies()],
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const inviteToken = ctx?.headers?.get("x-invite-token");

          if (!inviteToken) {
            throw new APIError("FORBIDDEN", {
              message: "Invitation required",
            });
          }

          const [invitation] = await db
            .select()
            .from(schema.invitation)
            .where(
              and(
                eq(schema.invitation.token, inviteToken),
                isNull(schema.invitation.usedBy),
                gt(schema.invitation.expiresAt, new Date())
              )
            )
            .limit(1);

          if (!invitation) {
            throw new APIError("FORBIDDEN", {
              message: "Invalid or expired invitation",
            });
          }

          if (invitation.email && invitation.email !== user.email) {
            throw new APIError("FORBIDDEN", {
              message: "This invitation is for a different email",
            });
          }

          return { data: user };
        },
        after: async (user, ctx) => {
          const inviteToken = ctx?.headers?.get("x-invite-token");

          if (inviteToken) {
            await db
              .update(schema.invitation)
              .set({
                usedBy: user.id,
                usedAt: new Date(),
              })
              .where(eq(schema.invitation.token, inviteToken));
          }
        },
      },
    },
  },
});
