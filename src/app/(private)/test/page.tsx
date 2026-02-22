import { getSession } from "@/lib/auth/session";

export default async function TestPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">
        Page privée — {session.user.name}
      </h1>
    </div>
  );
}
