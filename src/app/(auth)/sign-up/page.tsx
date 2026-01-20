import type { Metadata } from "next";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = {
  title: "Inscription",
  description: "Créez votre compte",
};

export default function SignUpPage() {
  return <SignUpForm />;
}
