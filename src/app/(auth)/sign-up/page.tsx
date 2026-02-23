import { and, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Inscription",
  description: "Créez votre compte",
};

async function validateInvite(token: string | null): Promise<boolean> {
  if (!token) return false;

  const [inv] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.token, token),
        isNull(invitation.usedBy),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return !!inv;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const inviteValid = await validateInvite(invite ?? null);

  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Chargement...</h1>
          </div>
        </div>
      }
    >
      <SignUpForm inviteToken={invite ?? null} inviteValid={inviteValid} />
    </Suspense>
  );
}
