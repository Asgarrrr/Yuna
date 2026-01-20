"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type AuthState = {
  error?: string;
  success?: boolean;
};

export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email et mot de passe requis" };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return { error: error.message ?? "Identifiants invalides" };
    }
    return { error: "Identifiants invalides" };
  }

  redirect("/");
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "Tous les champs sont requis" };
  }

  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères" };
  }

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });
  } catch (error) {
    console.error("Sign up error:", error);
    if (error instanceof APIError) {
      return { error: error.message ?? "Erreur lors de l'inscription" };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Erreur lors de l'inscription" };
  }

  return { success: true };
}
