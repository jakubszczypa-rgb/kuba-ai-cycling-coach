"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Konto utworzone. Sprawdź e-mail, jeśli Supabase wymaga potwierdzenia adresu.");
      return;
    }

    router.push("/check-in");
    router.refresh();
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <p className="text-sm text-zinc-500">KUBA AI CYCLING COACH</p>
          <h1 className="mt-2 text-3xl font-bold">{mode === "login" ? "Zaloguj się" : "Utwórz konto"}</h1>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3" type="email" required placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} />
          <input className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3" type="password" required minLength={6} placeholder="Hasło" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-black" type="submit">
            {mode === "login" ? "Zaloguj" : "Utwórz konto"}
          </button>
        </form>
        {message && <p className="text-sm text-zinc-300">{message}</p>}
        <button className="text-sm text-zinc-400 underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "Nie mam jeszcze konta" : "Mam już konto"}
        </button>
      </div>
    </main>
  );
}
