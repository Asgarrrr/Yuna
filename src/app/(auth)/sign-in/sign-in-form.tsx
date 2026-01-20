"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    } catch {
      setPasskeyError(null);
    } finally {
      setPasskeyPending(false);
    }
  };

  const isLoading = pending || passkeyPending;
  const error = state.error || passkeyError;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Connexion</CardTitle>
        <CardDescription>
          Entrez vos identifiants pour vous connecter
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
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
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {pending ? "Connexion..." : "Se connecter"}
          </Button>
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={handlePasskeySignIn}
          >
            <Fingerprint className="mr-2 h-4 w-4" />
            {passkeyPending ? "Authentification..." : "Passkey / Biométrie"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Pas encore de compte ?{" "}
            <Link href="/sign-up" className="underline hover:text-primary">
              S'inscrire
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
