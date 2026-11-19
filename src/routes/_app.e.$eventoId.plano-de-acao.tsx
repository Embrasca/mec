/** Plano de ação (do EventSustain): o que fazer, quem, até quando e com que evidência. */
import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, formatarData, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  acaoSchema,
  NOME_DA_PRIORIDADE_DA_ACAO,
  NOME_DO_STATUS,
  PRIORIDADES_DA_ACAO,
  STATUS_DA_ACAO,
  type Acao,
} from "@/domain/gestao";
import { useEvento } from "@/lib/evento-atual";
import { hojeISO } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import {
  acaoSalvar,
  acoesListar,
  gestaoRemover,
  reducaoObter,
  temasListar,
} from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/plano-de-acao")({
  head: () => ({ meta: [{ title: "Plano de ação" }] }),
  component: PlanoDeAcao,
});

const VAZIA: Acao = {
  acao: "",
  descricao: null,
  temaId: null,
  medidaId: null,
  responsavel: null,
  prazo: null,
  status: "pendente",
  prioridade: "media",
  evidenciaEsperada: null,
  progresso: 0,
};

const TOM: Record<string, string> = {
  atrasada: "bg-danger-soft text-danger-text",
  concluida: "bg-success-soft text-success-text",
  em_andamento: "bg-info-soft text-info-text",
  pendente: "bg-muted text-foreground",
  cancelada: "bg-muted text-muted-foreground line-through",
};

function PlanoDeAcao() {
  const evento = useEvento();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const lista = useQuery({
    queryKey: ["acoes", evento.id, hoje],
    queryFn: () => acoesListar({ data: { eventoId: evento.id, hoje } }),
  });
  const [editando, setEditando] = useState<{ id: string | null; dados: Acao } | null>(null);
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["acoes", evento.id] }),
      qc.invalidateQueries({ queryKey: ["linha-do-tempo", evento.id] }),
    ]);
  const remover = useMutation({
    mutationFn: (id: string) => gestaoRemover({ data: { eventoId: evento.id, tipo: "acao", id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  if (lista.isLoading) return <Carregando />;
  if (!lista.data) return <Falha erro={lista.error} />;
  const acoes = lista.data.acoes;
  const contar = (s: string) => acoes.filter((a) => a.situacao === s).length;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Plano de ação"
        description="O que precisa ser feito, por quem, até quando e com qual evidência. A ação fica atrasada sozinha quando o prazo vence sem que ela esteja concluída ou cancelada."
        actions={
          evento.podeEditar && (
            <Button onClick={() => setEditando({ id: null, dados: VAZIA })}>
              <Plus className="size-4" /> Ação
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-4">
        {(["pendente", "em_andamento", "atrasada", "concluida"] as const).map((s) => (
          <div key={s} className="panel p-4">
            <p className="eyebrow">{NOME_DO_STATUS[s]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{contar(s)}</p>
          </div>
        ))}
      </div>
      <Panel title="Ações">
        {acoes.length === 0 ? (
          <Vazio>Nenhuma ação cadastrada.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Ação</th>
                  <th className="py-2 pr-3 font-medium">Ligada a</th>
                  <th className="py-2 pr-3 font-medium">Responsável</th>
                  <th className="py-2 pr-3 font-medium">Prazo</th>
                  <th className="py-2 pr-3 font-medium">Prioridade</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="w-36 py-2 pr-3 font-medium">Progresso</th>
                  {evento.podeEditar && <th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {acoes.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="py-2 pr-3 font-medium">
                      {a.acao}
                      {a.evidenciaEsperada && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          Evidência: {a.evidenciaEsperada}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {a.tema && <span className="block">Tema: {a.tema}</span>}
                      {a.medida && <span className="block">Medida: {a.medida}</span>}
                      {!a.tema && !a.medida && "—"}
                    </td>
                    <td className="py-2 pr-3">{a.responsavel ?? "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {a.prazo ? formatarData(a.prazo) : "—"}
                    </td>
                    <td className="py-2 pr-3">{NOME_DA_PRIORIDADE_DA_ACAO[a.prioridade]}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          TOM[a.situacao],
                        )}
                      >
                        {NOME_DO_STATUS[a.situacao]}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={a.progresso}
                          className="w-20"
                          aria-label={`Progresso de ${a.acao}`}
                        />
                        <span className="text-xs tabular-nums">{a.progresso}%</span>
                      </div>
                    </td>
                    {evento.podeEditar && (
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const { id, situacao: _s, tema: _t, medida: _m, ...dados } = a;
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
                            window.confirm("Remover esta ação?") && remover.mutate(a.id)
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
        <FormularioDaAcao inicial={editando} fechar={() => setEditando(null)} salvo={atualizar} />
      )}
    </>
  );
}

function FormularioDaAcao({
  inicial,
  fechar,
  salvo,
}: {
  inicial: { id: string | null; dados: Acao };
  fechar: () => void;
  salvo: () => Promise<unknown>;
}) {
  const evento = useEvento();
  const [d, setD] = useState<Acao>(inicial.dados);
  const temas = useQuery({
    queryKey: ["temas", evento.id],
    queryFn: () => temasListar({ data: { eventoId: evento.id } }),
  });
  const reducao = useQuery({
    queryKey: ["reducao", evento.id],
    queryFn: () => reducaoObter({ data: { eventoId: evento.id } }),
  });
  const mudar = <K extends keyof Acao>(k: K, v: Acao[K]) => setD((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: (dados: Acao) =>
      acaoSalvar({ data: { eventoId: evento.id, id: inicial.id, dados } }),
    onSuccess: async () => {
      await salvo();
      toast.success("Ação salva.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = acaoSchema.safeParse(d);
    if (!r.success) toast.error(r.error.issues[0]?.message ?? "Revise os campos.");
    else salvar.mutate(r.data);
  };
  const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar ação" : "Nova ação"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-acao">Ação</Label>
            <Input
              id="a-acao"
              required
              maxLength={300}
              value={d.acao}
              onChange={(e) => mudar("acao", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="a-desc">Descrição</Label>
            <Input
              id="a-desc"
              maxLength={2000}
              value={d.descricao ?? ""}
              onChange={(e) => mudar("descricao", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-tema">Tema da matriz</Label>
            <select
              id="a-tema"
              className={sel}
              value={d.temaId ?? ""}
              onChange={(e) => mudar("temaId", e.target.value || null)}
            >
              <option value="">—</option>
              {temas.data?.temas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tema}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-medida">Medida de redução</Label>
            <select
              id="a-medida"
              className={sel}
              value={d.medidaId ?? ""}
              onChange={(e) => mudar("medidaId", e.target.value || null)}
            >
              <option value="">—</option>
              {reducao.data?.medidas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.acao}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-resp">Responsável</Label>
            <Input
              id="a-resp"
              maxLength={200}
              value={d.responsavel ?? ""}
              onChange={(e) => mudar("responsavel", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-prazo">Prazo</Label>
            <Input
              id="a-prazo"
              type="date"
              value={d.prazo ?? ""}
              onChange={(e) => mudar("prazo", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-status">Status</Label>
            <select
              id="a-status"
              className={sel}
              value={d.status}
              onChange={(e) => {
                const status = e.target.value as Acao["status"];
                setD((x) => ({
                  ...x,
                  status,
                  progresso: status === "concluida" ? 100 : x.progresso,
                }));
              }}
            >
              {STATUS_DA_ACAO.map((s) => (
                <option key={s} value={s}>
                  {NOME_DO_STATUS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-prio">Prioridade</Label>
            <select
              id="a-prio"
              className={sel}
              value={d.prioridade}
              onChange={(e) => mudar("prioridade", e.target.value as Acao["prioridade"])}
            >
              {PRIORIDADES_DA_ACAO.map((p) => (
                <option key={p} value={p}>
                  {NOME_DA_PRIORIDADE_DA_ACAO[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-prog">Progresso (%)</Label>
            <Input
              id="a-prog"
              type="number"
              min={0}
              max={100}
              step={5}
              value={d.progresso}
              onChange={(e) =>
                mudar(
                  "progresso",
                  Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))),
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-ev">Evidência esperada</Label>
            <Input
              id="a-ev"
              maxLength={500}
              value={d.evidenciaEsperada ?? ""}
              onChange={(e) => mudar("evidenciaEsperada", e.target.value || null)}
            />
          </div>
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
