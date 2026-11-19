/** Aba OCORRÊNCIAS da Ferramenta: todo fato relevante que possa afetar os dados. */
import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, formatarData, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORIAS_DE_OCORRENCIA,
  FASES,
  IMPACTOS,
  ocorrenciaSchema,
  ocorrenciaVazia,
  SITUACOES,
  type Ocorrencia,
} from "@/domain/metodologia/posEvento";
import { useEvento } from "@/lib/evento-atual";
import { hojeISO } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { ocorrenciaRemover, ocorrenciaSalvar, ocorrenciasListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/ocorrencias")({
  head: () => ({ meta: [{ title: "Ocorrências" }] }),
  component: Ocorrencias,
});

const TOM: Record<Ocorrencia["situacao"], string> = {
  Aberta: "bg-danger-soft text-danger-text",
  "Em tratamento": "bg-warning-soft text-warning-text",
  Resolvida: "bg-success-soft text-success-text",
};

function Ocorrencias() {
  const evento = useEvento();
  const qc = useQueryClient();
  const lista = useQuery({
    queryKey: ["ocorrencias", evento.id],
    queryFn: () => ocorrenciasListar({ data: { eventoId: evento.id } }),
  });
  const [editando, setEditando] = useState<{ id: string | null; dados: Ocorrencia } | null>(null);
  const atualizar = () => qc.invalidateQueries({ queryKey: ["ocorrencias", evento.id] });
  const remover = useMutation({
    mutationFn: (id: string) => ocorrenciaRemover({ data: { eventoId: evento.id, id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  if (lista.isLoading) return <Carregando />;
  if (!lista.data) return <Falha erro={lista.error} />;
  const { lista: itens, resumo } = lista.data;

  return (
    <>
      <PageHeader
        eyebrow="Execução · Aba OCORRÊNCIAS da Ferramenta"
        title="Ocorrências"
        description="Registre todo fato relevante que possa afetar os dados: medidor sem leitura, fornecedor que não enviou o dado, mudança de programação, pesagem perdida, gerador extra. Registre no mesmo dia."
        actions={
          evento.podeEditar && (
            <Button
              onClick={() =>
                setEditando({ id: null, dados: { ...ocorrenciaVazia(), data: hojeISO() } })
              }
            >
              <Plus className="size-4" /> Ocorrência
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <p className="eyebrow">Registradas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{resumo.registradas}</p>
        </div>
        <div className="panel p-4">
          <p className="eyebrow">Abertas ou em tratamento</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{resumo.abertas}</p>
        </div>
      </div>
      {resumo.alerta && (
        <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
          <AlertTriangle className="size-4 shrink-0" /> {resumo.alerta}
        </p>
      )}
      <Panel title="Ficha de ocorrências">
        {itens.length === 0 ? (
          <Vazio>Nenhuma ocorrência registrada.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-8 py-2 pr-2 font-medium">Nº</th>
                  <th className="py-2 pr-3 font-medium">Data · fase</th>
                  <th className="py-2 pr-3 font-medium">Categoria</th>
                  <th className="py-2 pr-3 font-medium">Ocorrência</th>
                  <th className="py-2 pr-3 font-medium">Impacto nos dados</th>
                  <th className="py-2 pr-3 font-medium">Ação adotada</th>
                  <th className="py-2 pr-3 font-medium">Responsável</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 pr-3 font-medium">Premissa ou método alternativo</th>
                  {evento.podeEditar && <th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {itens.map((o, i) => (
                  <tr key={o.id} className="align-top">
                    <td className="py-2 pr-2 tabular-nums">{i + 1}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {o.data ? formatarData(o.data) : "—"}
                      {o.fase && (
                        <span className="block text-xs text-muted-foreground">{o.fase}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{o.categoria ?? "—"}</td>
                    <td className="py-2 pr-3 font-medium">{o.ocorrencia}</td>
                    <td className="py-2 pr-3">{o.impacto ?? "—"}</td>
                    <td className="py-2 pr-3">{o.acao ?? "—"}</td>
                    <td className="py-2 pr-3">{o.responsavel ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                          TOM[o.situacao],
                        )}
                      >
                        {o.situacao}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{o.premissa ?? "—"}</td>
                    {evento.podeEditar && (
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const { id, ...dados } = o;
                            setEditando({ id, dados });
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remover.isPending}
                          onClick={() =>
                            window.confirm("Remover esta ocorrência?") && remover.mutate(o.id)
                          }
                        >
                          Remover
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {editando && (
        <FormularioDaOcorrencia
          inicial={editando}
          fechar={() => setEditando(null)}
          salvo={atualizar}
        />
      )}
    </>
  );
}

function FormularioDaOcorrencia({
  inicial,
  fechar,
  salvo,
}: {
  inicial: { id: string | null; dados: Ocorrencia };
  fechar: () => void;
  salvo: () => Promise<unknown>;
}) {
  const evento = useEvento();
  const [d, setD] = useState<Ocorrencia>(inicial.dados);
  const mudar = <K extends keyof Ocorrencia>(k: K, v: Ocorrencia[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: (dados: Ocorrencia) =>
      ocorrenciaSalvar({ data: { eventoId: evento.id, id: inicial.id, dados } }),
    onSuccess: async () => {
      await salvo();
      toast.success("Ocorrência salva.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = ocorrenciaSchema.safeParse(d);
    if (!r.success) toast.error(r.error.issues[0]?.message ?? "Revise os campos.");
    else salvar.mutate(r.data);
  };
  const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  const texto = (k: "acao" | "responsavel" | "premissa", rotulo: string, max: number) => (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={`o-${k}`}>{rotulo}</Label>
      <Input
        id={`o-${k}`}
        maxLength={max}
        value={d[k] ?? ""}
        onChange={(e) => mudar(k, e.target.value || null)}
      />
    </div>
  );
  const lista = <K extends "fase" | "categoria" | "impacto">(
    k: K,
    rotulo: string,
    opcoes: readonly string[],
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`o-${k}`}>{rotulo}</Label>
      <select
        id={`o-${k}`}
        className={sel}
        value={d[k] ?? ""}
        onChange={(e) => mudar(k, (e.target.value || null) as Ocorrencia[K])}
      >
        <option value="">—</option>
        {opcoes.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar ocorrência" : "Nova ocorrência"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="o-ocorrencia">Ocorrência</Label>
            <Input
              id="o-ocorrencia"
              required
              maxLength={1000}
              value={d.ocorrencia}
              onChange={(e) => mudar("ocorrencia", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="o-data">Data</Label>
            <Input
              id="o-data"
              type="date"
              value={d.data ?? ""}
              onChange={(e) => mudar("data", e.target.value || null)}
            />
          </div>
          {lista("fase", "Fase", FASES)}
          {lista("categoria", "Categoria", CATEGORIAS_DE_OCORRENCIA)}
          {lista("impacto", "Impacto nos dados", IMPACTOS)}
          {texto("acao", "Ação adotada", 1000)}
          {texto("responsavel", "Responsável", 200)}
          <div className="space-y-1.5">
            <Label htmlFor="o-situacao">Situação</Label>
            <select
              id="o-situacao"
              className={sel}
              value={d.situacao}
              onChange={(e) => mudar("situacao", e.target.value as Ocorrencia["situacao"])}
            >
              {SITUACOES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {texto("premissa", "Premissa ou método alternativo", 2000)}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
