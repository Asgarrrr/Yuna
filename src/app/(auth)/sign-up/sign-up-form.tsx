"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, Check } from "lucide-react";
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
import { type AuthState, signUp } from "../actions";

const initialState: AuthState = {};

export function SignUpForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  const handleAddPasskey = async () => {
    setPasskeyError(null);
    setPasskeyPending(true);

    try {
      const result = await authClient.passkey.addPasskey({
        name: "Mon appareil",
      });
      if (result.error) {
        const message = result.error.message ?? "";
        if (
          message.includes("timed out") ||
          message.includes("not allowed") ||
          message.includes("AbortError")
        ) {
          setPasskeyError(null);
        } else {
          setPasskeyError("Échec de la configuration passkey");
        }
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setPasskeyError(null);
    } finally {
      setPasskeyPending(false);
    }
  };

  const handleSkip = () => {
    router.push("/");
    router.refresh();
  };

  if (state.success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <Check className="h-4 w-4 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Compte créé</CardTitle>
          </div>
          <CardDescription>
            Ajoutez une passkey pour vous connecter plus rapidement avec votre
            empreinte ou Face ID
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {passkeyError && (
            <div className="text-sm text-destructive">{passkeyError}</div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            className="w-full"
            onClick={handleAddPasskey}
            disabled={passkeyPending}
          >
            <Fingerprint className="mr-2 h-4 w-4" />
            {passkeyPending ? "Configuration..." : "Ajouter une passkey"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={handleSkip}
            disabled={passkeyPending}
          >
            Passer cette étape
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Inscription</CardTitle>
        <CardDescription>Créez votre compte pour commencer</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {state.error && (
            <div className="text-sm text-destructive">{state.error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="John Doe"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="email@exemple.com"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="8 caractères minimum"
              required
              minLength={8}
              disabled={pending}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Inscription..." : "S'inscrire"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Déjà un compte ?{" "}
            <Link href="/sign-in" className="underline hover:text-primary">
              Se connecter
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
