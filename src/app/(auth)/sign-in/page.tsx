import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre compte",
};

export default function SignInPage() {
  return <SignInForm />;
}
