import { and, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { connection } from "next/server";
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

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
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
      <SignUpLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function SignUpLoader({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const [{ invite }] = await Promise.all([searchParams, connection()]);
  const inviteToken = invite ?? null;
  const inviteValid = await validateInvite(inviteToken);

  return <SignUpForm inviteToken={inviteToken} inviteValid={inviteValid} />;
}
