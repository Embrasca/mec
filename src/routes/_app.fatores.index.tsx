import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import { Carregando, Falha, formatarDataHora, PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessao } from "@/lib/sessao";
import { baseCriarVersao, basesListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/fatores/")({
  head: () => ({ meta: [{ title: "Base de fatores" }] }),
  component: Bases,
});

function Bases() {
  const { perfil } = useSessao();
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => basesListar() });
  return (
    <Shell>
      <PageHeader
        eyebrow="Governança"
        title="Base de fatores"
        description="Fatores de emissão usados no inventário. Base publicada não muda: para atualizar um fator, a administração cria uma nova versão. Cada evento fica com a base escolhida até fechar o ex-ante."
      />
      <Panel title="Versões">
        {bases.isLoading && <Carregando />}
        {bases.error && <Falha erro={bases.error} />}
        {bases.data && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 pr-3 font-medium">GWP</th>
                <th className="py-2 pr-3 font-medium">Derivada de</th>
                <th className="py-2 pr-3 text-right font-medium">Eventos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bases.data.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3 font-medium">
                    <Link
                      to="/fatores/$baseId"
                      params={{ baseId: b.id }}
                      className="text-brand underline-offset-2 hover:underline"
                    >
                      {b.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {b.situacao === "publicada"
                      ? `Publicada${b.publicadaEm ? ` em ${formatarDataHora(b.publicadaEm)}` : ""}`
                      : "Rascunho"}
                  </td>
                  <td className="py-2 pr-3">
                    {b.referenciaGwp} (CH₄ {b.gwpCh4}, N₂O {b.gwpN2o})
                  </td>
                  <td className="py-2 pr-3">{b.derivadaDe ?? "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.eventos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {perfil?.adminPlataforma && bases.data && (
        <NovaVersao bases={bases.data.filter((b) => b.situacao === "publicada")} />
      )}
    </Shell>
  );
}

function NovaVersao({ bases }: { bases: { id: string; nome: string }[] }) {
  const navegar = useNavigate();
  const [de, setDe] = useState(bases[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const criar = useMutation({
    mutationFn: () => baseCriarVersao({ data: { deBaseId: de, nome, observacao: null } }),
    onSuccess: ({ id }) => {
      toast.success("Rascunho criado.");
      void navegar({ to: "/fatores/$baseId", params: { baseId: id } });
    },
    onError: (e) => toast.error(e.message),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    criar.mutate();
  };
  return (
    <Panel
      title="Nova versão"
      hint="Copia uma base publicada para um rascunho editável. Publique quando estiver pronta."
    >
      <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="nv-de">A partir de</Label>
          <select
            id="nv-de"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nv-nome">Nome da nova versão</Label>
          <Input
            id="nv-nome"
            required
            minLength={3}
            maxLength={120}
            placeholder="Ex.: GHG Protocol Brasil 2027.0.1"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={criar.isPending || !de}>
          Criar rascunho
        </Button>
      </form>
    </Panel>
  );
}
