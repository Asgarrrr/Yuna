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
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Email et mot de passe requis" };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === 401) {
      return { error: "Identifiants invalides" };
    }
    return { error: "Identifiants invalides" };
  }

  redirect("/");
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof name !== "string" || typeof email !== "string" || typeof password !== "string" ||
    !name || !email || !password
  ) {
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
    if (error instanceof APIError) {
      if (error.status === 422) {
        return { error: "Un compte avec cet email existe déjà" };
      }
      return { error: "Erreur lors de l'inscription" };
    }
    return { error: "Erreur lors de l'inscription" };
  }

  return { success: true };
}
