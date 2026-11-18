import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useSessao } from "@/lib/sessao";
import { loadAuthClient } from "@/lib/neon-auth-client";
import { neonAuthUrl } from "@/lib/auth-config";
import { MARCA, NOME_DA_PLATAFORMA } from "@/lib/marca";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: `Entrar — ${NOME_DA_PLATAFORMA}` }] }),
  component: Entrar,
});

const campo =
  "h-12 w-full rounded-md border border-border bg-transparent px-3.5 text-[16px] text-foreground outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand/35";

function Entrar() {
  const { entrar, perfil, pronta } = useSessao();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (pronta && perfil) void navegar({ to: "/eventos", replace: true });
  }, [pronta, perfil, navegar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await entrar(email, senha);
      void navegar({ to: "/eventos" });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setEnviando(false);
    }
  }

  async function recuperar() {
    if (!email.trim()) return setErro("Informe seu e-mail para receber o link de recuperação.");
    setErro("");
    setAviso("");
    try {
      const auth = await loadAuthClient(neonAuthUrl());
      await auth.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
    } catch {
      // A resposta é a mesma com ou sem conta, para não revelar quem está cadastrado.
    }
    setAviso("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.");
  }

  return (
    <div className="tema-claro grid min-h-dvh grid-cols-1 bg-background md:grid-cols-[60%_40%] lg:grid-cols-[42%_58%]">
      <section className="flex flex-col justify-center bg-background-login px-8 sm:px-14 lg:px-20">
        <div className="w-full max-w-[400px]">
          <div className="flex items-center gap-3.5">
            <img src="/embrasca-logo.svg" alt="" className="size-12" width={48} height={48} />
            <p className="text-[27px] font-bold leading-none tracking-[-0.02em]">
              {MARCA.prefixo}
              <span className="text-brand-green">{MARCA.sufixo}</span>
            </p>
          </div>
          <h1 className="mt-16 text-[21px] font-semibold tracking-tight">Entre na sua conta</h1>
          <form onSubmit={enviar} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-[14px] font-medium">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={campo}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="senha" className="block text-[14px] font-medium">
                Senha
              </label>
              <div className="relative">
                <input
                  id="senha"
                  type={ver ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={`${campo} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setVer((v) => !v)}
                  aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={ver}
                  className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {aviso && (
              <p role="status" className="text-[14px]">
                {aviso}
              </p>
            )}
            {erro && (
              <p role="alert" className="text-[14px] text-danger">
                {erro}
              </p>
            )}
            <button
              type="submit"
              disabled={enviando}
              className="h-12 w-full rounded-md bg-brand text-[15px] font-semibold text-brand-foreground hover:bg-brand/90 disabled:opacity-60"
            >
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => void recuperar()}
            className="mt-4 block min-h-11 text-[14px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Esqueci minha senha
          </button>
          <p className="mt-4 border-t border-border pt-4 text-[14px] text-muted-foreground">
            Não tem acesso? Peça à administração da plataforma para criar sua conta.
          </p>
        </div>
      </section>
      <section className="relative hidden overflow-hidden md:block">
        <img
          src="/login-hero.jpg"
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </section>
    </div>
  );
}
