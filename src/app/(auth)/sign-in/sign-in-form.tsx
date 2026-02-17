"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { type AuthState, signIn } from "../actions";

const initialState: AuthState = {};

export function SignInForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyPending, setPasskeyPending] = useState(false);

  const handlePasskeySignIn = async () => {
    setPasskeyError(null);
    setPasskeyPending(true);

    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        const message = result.error.message ?? "";
        if (
          message.includes("timed out") ||
          message.includes("not allowed") ||
          message.includes("AbortError")
        ) {
          setPasskeyError(null);
        } else {
          setPasskeyError("Échec de l'authentification passkey");
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "NotAllowedError") {
        setPasskeyError("Erreur de connexion, veuillez réessayer");
      }
    } finally {
      setPasskeyPending(false);
    }
  };

  const isLoading = pending || passkeyPending;
  const error = state.error || passkeyError;

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Connexion</h1>
        <p className="text-muted-foreground">
          Entrez vos identifiants pour vous connecter
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        {error && (
          <div role="alert" className="text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="email@exemple.com"
            required
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            disabled={isLoading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {pending ? "Connexion..." : "Se connecter"}
        </Button>
      </form>
      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isLoading}
          onClick={handlePasskeySignIn}
        >
          <Fingerprint aria-hidden="true" className="mr-2 h-4 w-4" />
          {passkeyPending ? "Authentification..." : "Passkey / Biométrie"}
        </Button>
        <p className="text-sm text-muted-foreground text-center">
          Pas encore de compte ?{" "}
          <Link href="/sign-up" className="underline hover:text-primary">
            S'inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}
