import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
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

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return null;
  return session;
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  const body = await request.json().catch(() => ({}));
  const { email } = body;
  const expiresInDays = Math.min(Math.max(Number(body.expiresInDays) || 7, 1), 30);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [newInvitation] = await db
    .insert(invitation)
    .values({
      id: crypto.randomUUID(),
      token: generateToken(),
      email: email ?? null,
      createdBy: session.user.id,
      expiresAt,
    })
    .returning();

  const baseUrl =
    request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL;
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

  const { id } = await request.json();

  await db.delete(invitation).where(eq(invitation.id, id));

  return NextResponse.json({ success: true });
}
