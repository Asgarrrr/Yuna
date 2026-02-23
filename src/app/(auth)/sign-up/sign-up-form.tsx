"use client";

import { Check, Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { type AuthState, signUp } from "../actions";

const initialState: AuthState = {};

export function SignUpForm({
  inviteToken,
  inviteValid,
}: {
  inviteToken: string | null;
  inviteValid: boolean;
}) {
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
    } catch (error) {
      if (error instanceof Error && error.name !== "NotAllowedError") {
        setPasskeyError("Erreur de configuration, veuillez réessayer");
      }
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
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
              <Check
                aria-hidden="true"
                className="h-4 w-4 text-primary-foreground"
              />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Compte créé</h1>
          </div>
          <p className="text-muted-foreground">
            Ajoutez une passkey pour vous connecter plus rapidement avec votre
            empreinte ou Face ID
          </p>
        </div>
        {passkeyError && (
          <div role="alert" className="text-sm text-destructive">
            {passkeyError}
          </div>
        )}
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={handleAddPasskey}
            disabled={passkeyPending}
          >
            <Fingerprint aria-hidden="true" className="mr-2 h-4 w-4" />
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
        </div>
      </div>
    );
  }

  if (!inviteValid) {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Sur invitation</h1>
          <p className="text-muted-foreground">
            Yuna est accessible uniquement sur invitation. Demandez un lien à un
            membre pour rejoindre.
          </p>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Déjà un compte ?{" "}
          <Link href="/sign-in" className="underline hover:text-primary">
            Se connecter
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Inscription</h1>
        <p className="text-muted-foreground">
          Créez votre compte pour commencer
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="invite" value={inviteToken ?? ""} />
        {state.error && (
          <div role="alert" className="text-sm text-destructive">
            {state.error}
          </div>
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Inscription..." : "S'inscrire"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground text-center">
        Déjà un compte ?{" "}
        <Link href="/sign-in" className="underline hover:text-primary">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
