import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { and, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  plugins: [passkey(), nextCookies()],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
    },
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

          // Validate token exists and check email constraint (read-only check)
          const [invitation] = await db
            .select()
            .from(schema.invitation)
            .where(
              and(
                eq(schema.invitation.token, inviteToken),
                isNull(schema.invitation.usedBy),
                gt(schema.invitation.expiresAt, new Date()),
              ),
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
            // Atomic claim: only mark as used if still unclaimed (prevents race condition)
            await db
              .update(schema.invitation)
              .set({
                usedBy: user.id,
                usedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.invitation.token, inviteToken),
                  isNull(schema.invitation.usedBy),
                ),
              );
          }
        },
      },
    },
  },
});
