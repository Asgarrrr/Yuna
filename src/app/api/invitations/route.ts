import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

const invitationCreateSchema = z.object({
  email: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().email().nullable().optional(),
  ),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

const invitationDeleteSchema = z.object({
  id: z.string().uuid(),
});

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return null;
  return session;
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = invitationCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const expiresInDays = parsed.data.expiresInDays ?? 7;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [newInvitation] = await db
    .insert(invitation)
    .values({
      id: crypto.randomUUID(),
      token: generateToken(),
      email: parsed.data.email ?? null,
      createdBy: session.user.id,
      expiresAt,
    })
    .returning();

  const baseUrl = request.nextUrl.origin;
  const inviteUrl = `${baseUrl}/sign-up?invite=${newInvitation.token}`;

  return NextResponse.json({
    invitation: newInvitation,
    url: inviteUrl,
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  // Token validation is public (needed for sign-up flow)
  if (token) {
    const [inv] = await db
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.token, token),
          isNull(invitation.usedBy),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return NextResponse.json({ valid: !!inv });
  }

  // Listing all invitations requires admin
  const session = await requireAdmin();
  if (!session) return forbidden();

  const invitations = await db
    .select()
    .from(invitation)
    .orderBy(invitation.createdAt);

  return NextResponse.json({ invitations });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  const body = await request.json().catch(() => null);
  const parsed = invitationDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await db.delete(invitation).where(eq(invitation.id, parsed.data.id));

  return NextResponse.json({ success: true });
}
