import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { loadAuthClient } from "@/lib/neon-auth-client";
import { neonAuthUrl } from "@/lib/auth-config";

export const Route = createFileRoute("/redefinir-senha")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s["token"] === "string" ? s["token"] : "",
  }),
  component: Redefinir,
});

function Redefinir() {
  const { token } = Route.useSearch();
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 10) return setMsg("Use pelo menos 10 caracteres.");
    const auth = await loadAuthClient(neonAuthUrl());
    const r = await auth.resetPassword({ newPassword: senha, token });
    if (r.error) return setMsg("O link expirou ou é inválido. Peça um novo na tela de entrada.");
    setOk(true);
  }

  return (
    <div className="tema-claro grid min-h-dvh place-items-center bg-background px-4">
      <form onSubmit={enviar} className="panel w-full max-w-sm space-y-4 p-6">
        <h1 className="text-lg font-semibold">Nova senha</h1>
        {ok ? (
          <p className="text-sm">
            Senha alterada.{" "}
            <Link to="/" className="text-brand underline">
              Entrar
            </Link>
          </p>
        ) : (
          <>
            <input
              type="password"
              autoComplete="new-password"
              aria-label="Nova senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-transparent px-3"
            />
            {msg && (
              <p role="alert" className="text-sm text-danger">
                {msg}
              </p>
            )}
            <button
              type="submit"
              className="h-11 w-full rounded-md bg-brand font-semibold text-brand-foreground"
            >
              Salvar senha
            </button>
          </>
        )}
      </form>
    </div>
  );
}
