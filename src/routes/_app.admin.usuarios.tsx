import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadAuthClient } from "@/lib/neon-auth-client";
import { neonAuthUrl } from "@/lib/auth-config";
import { useSessao } from "@/lib/sessao";
import { usuarioAlterar, usuarioRegistrar, usuariosListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/admin/usuarios")({
  head: () => ({ meta: [{ title: "Usuários" }] }),
  component: Usuarios,
});

function Usuarios() {
  const { perfil } = useSessao();
  const qc = useQueryClient();
  const lista = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => usuariosListar(),
    enabled: Boolean(perfil?.adminPlataforma),
  });
  const alterar = useMutation({
    mutationFn: async (v: { id: string; adminPlataforma?: boolean; ativo?: boolean }) => {
      // O papel no Neon Auth acompanha a administração da plataforma: sem ele,
      // a pessoa promovida não consegue criar contas.
      if (v.adminPlataforma !== undefined) {
        const auth = await loadAuthClient(neonAuthUrl());
        const r = await auth.admin.setRole({
          userId: v.id,
          role: v.adminPlataforma ? "admin" : "user",
        });
        if (r.error) throw new Error(mensagemDoProvedor(r.error));
      }
      return usuarioAlterar({ data: v });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <Shell>
      <PageHeader
        eyebrow="Administração"
        title="Usuários"
        description="Contas da plataforma. O acesso a cada evento é dado na equipe do evento."
      />
      {!perfil?.adminPlataforma ? (
        <Falha erro={new Error("Apenas a administração da plataforma acessa esta tela.")} />
      ) : (
        <>
          <NovaConta />
          <Panel title="Contas">
            {lista.isLoading && <Carregando />}
            {lista.error && <Falha erro={lista.error} />}
            {lista.data && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Nome</th>
                      <th className="py-2 pr-3 font-medium">E-mail</th>
                      <th className="py-2 pr-3 font-medium">Eventos</th>
                      <th className="py-2 pr-3 font-medium">Administração</th>
                      <th className="py-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lista.data.map((u) => {
                      const eu = u.id === perfil.id;
                      return (
                        <tr key={u.id} className={u.ativo ? "" : "text-muted-foreground"}>
                          <td className="py-2 pr-3 font-medium">{u.nome}</td>
                          <td className="py-2 pr-3">{u.email}</td>
                          <td className="py-2 pr-3 tabular-nums">{u.eventos}</td>
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              aria-label={`Administração: ${u.nome}`}
                              checked={u.adminPlataforma}
                              disabled={eu || alterar.isPending}
                              onChange={(e) =>
                                alterar.mutate({ id: u.id, adminPlataforma: e.target.checked })
                              }
                            />
                          </td>
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={eu || alterar.isPending}
                              onClick={() => alterar.mutate({ id: u.id, ativo: !u.ativo })}
                            >
                              {u.ativo ? "Desativar" : "Reativar"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </Shell>
  );
}

/** Traduz as recusas do Neon Auth para mensagens em português. */
function mensagemDoProvedor(e: { status?: number | undefined; code?: string | undefined }): string {
  if (e.status === 401 || e.status === 403)
    return "O Neon Auth recusou a operação: sua conta não tem o papel de administração lá. Saia e entre de novo; se continuar, fale com o suporte.";
  if (e.code === "USER_ALREADY_EXISTS" || e.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
    return "Já existe uma conta com este e-mail.";
  if (e.code === "PASSWORD_TOO_SHORT") return "A senha provisória é curta demais.";
  return "O Neon Auth recusou a operação. Tente novamente.";
}

function NovaConta() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [admin, setAdmin] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 10) {
      toast.error("A senha provisória precisa de pelo menos 10 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      const auth = await loadAuthClient(neonAuthUrl());
      const criada = await auth.admin.createUser({
        name: nome.trim(),
        email: email.trim().toLowerCase(),
        password: senha,
        role: admin ? "admin" : "user",
      });
      const id = criada.data?.user?.id;
      if (criada.error || !id)
        throw new Error(
          criada.error ? mensagemDoProvedor(criada.error) : "Não foi possível criar a conta.",
        );
      await usuarioRegistrar({ data: { id, email, nome, adminPlataforma: admin } });
      await qc.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success("Conta criada. Envie a senha provisória à pessoa por um canal seguro.");
      setNome("");
      setEmail("");
      setSenha("");
      setAdmin(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a conta.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Panel
      title="Nova conta"
      hint="A pessoa entra com a senha provisória e pode trocá-la em “Esqueci minha senha”."
    >
      <form
        onSubmit={enviar}
        className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="nc-nome">Nome</Label>
          <Input
            id="nc-nome"
            required
            maxLength={200}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-email">E-mail</Label>
          <Input
            id="nc-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nc-senha">Senha provisória</Label>
          <Input
            id="nc-senha"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />{" "}
          Administração
        </label>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Criando…" : "Criar conta"}
        </Button>
      </form>
    </Panel>
  );
}
