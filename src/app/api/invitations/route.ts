import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { email, expiresInDays = 7 } = body;

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [newInvitation] = await db
    .insert(invitation)
    .values({
      id: generateId(),
      token,
      email: email || null,
      createdBy: session.user.id,
      expiresAt,
    })
    .returning();

  const baseUrl = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL;
  const inviteUrl = `${baseUrl}/register?invite=${token}`;

  return NextResponse.json({
    invitation: newInvitation,
    url: inviteUrl,
  });
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = request.nextUrl.searchParams.get("token");

  if (token) {
    const [inv] = await db
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.token, token),
          isNull(invitation.usedBy),
          gt(invitation.expiresAt, new Date())
        )
      )
      .limit(1);

    return NextResponse.json({ valid: !!inv });
  }

  const invitations = await db
    .select()
    .from(invitation)
    .where(eq(invitation.createdBy, session.user.id))
    .orderBy(invitation.createdAt);

  return NextResponse.json({ invitations });
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();

  await db
    .delete(invitation)
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.createdBy, session.user.id)
      )
    );

  return NextResponse.json({ success: true });
}
