import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Inscription",
  description: "Créez votre compte",
};

export default function SignUpPage() {
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
      <SignUpForm />
    </Suspense>
  );
}
