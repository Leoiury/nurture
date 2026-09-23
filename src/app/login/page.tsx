import type { Metadata } from "next";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar · Nurture" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Nurture</h1>
        <p className="mt-1 text-sm text-muted">Entre para acessar a agenda.</p>
        <FormLogin />
      </div>
    </main>
  );
}
