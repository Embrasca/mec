import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DESCRICAO_DO_PAPEL, NOME_DO_PAPEL, PAPEIS, type Papel } from "@/domain/evento";
import { useEvento } from "@/lib/evento-atual";
import { useSessao } from "@/lib/sessao";
import { equipeAdicionar, equipeListar, equipeRemover } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/equipe")({
  head: () => ({ meta: [{ title: "Equipe do evento" }] }),
  component: Equipe,
});

function Equipe() {
  const evento = useEvento();
  const { perfil } = useSessao();
  const qc = useQueryClient();
  const chave = ["equipe", evento.id];
  const equipe = useQuery({
    queryKey: chave,
    queryFn: () => equipeListar({ data: { eventoId: evento.id } }),
  });
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("equipe");
  const atualizar = () => qc.invalidateQueries({ queryKey: chave });

  const adicionar = useMutation({
    mutationFn: (v: { email: string; papel: Papel }) =>
      equipeAdicionar({ data: { eventoId: evento.id, ...v } }),
    onSuccess: () => {
      setEmail("");
      toast.success("Equipe atualizada.");
      return atualizar();
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (usuarioId: string) => equipeRemover({ data: { eventoId: evento.id, usuarioId } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    adicionar.mutate({ email, papel });
  }

  return (
    <>
      <PageHeader
        eyebrow="Evento"
        title="Equipe"
        description="Quem acessa este evento e o que cada papel pode fazer."
      />
      {evento.podeGerir && (
        <Panel
          title="Incluir pessoa"
          hint="A conta precisa existir. Novas contas são criadas pela administração em Usuários."
        >
          <form
            onSubmit={enviar}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor="eq-email">E-mail</Label>
              <Input
                id="eq-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eq-papel">Papel</Label>
              <select
                id="eq-papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {NOME_DO_PAPEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={adicionar.isPending}>
              Incluir
            </Button>
          </form>
          <ul className="mt-4 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {PAPEIS.map((p) => (
              <li key={p}>
                <strong className="text-foreground">{NOME_DO_PAPEL[p]}:</strong>{" "}
                {DESCRICAO_DO_PAPEL[p]}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Membros">
        {equipe.isLoading && <Carregando />}
        {equipe.error && <Falha erro={equipe.error} />}
        {equipe.data && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">E-mail</th>
                <th className="py-2 pr-3 font-medium">Papel</th>
                {evento.podeGerir && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {equipe.data.map((m) => (
                <tr key={m.usuarioId}>
                  <td className="py-2 pr-3 font-medium">{m.nome}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.email}</td>
                  <td className="py-2 pr-3">
                    {evento.podeGerir ? (
                      <select
                        aria-label={`Papel de ${m.nome}`}
                        value={m.papel}
                        onChange={(e) =>
                          adicionar.mutate({ email: m.email, papel: e.target.value as Papel })
                        }
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        {PAPEIS.map((p) => (
                          <option key={p} value={p}>
                            {NOME_DO_PAPEL[p]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      NOME_DO_PAPEL[m.papel]
                    )}
                  </td>
                  {evento.podeGerir && (
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remover.isPending}
                        onClick={() => {
                          const voce =
                            m.usuarioId === perfil?.id
                              ? " Você perderá o acesso a este evento."
                              : "";
                          if (window.confirm(`Remover ${m.nome} da equipe?${voce}`))
                            remover.mutate(m.usuarioId);
                        }}
                      >
                        Remover
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
