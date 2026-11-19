/** Aba "REDUÇÃO" da Ferramenta: medidas, metas e resultado alcançado. */
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
import { CATEGORIAS } from "@/domain/metodologia/inventario";
import {
  medidaSchema,
  medidaVazia,
  NOTA_DIFERENCA,
  OBJETIVOS,
  RESULTADOS,
  type Medida,
} from "@/domain/metodologia/reducao";
import { useEvento } from "@/lib/evento-atual";
import { numero, porcentagem } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { gestaoRemover, medidaSalvar, reducaoObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/reducao")({
  head: () => ({ meta: [{ title: "Plano de redução" }] }),
  component: Reducao,
});

function Reducao() {
  const evento = useEvento();
  const qc = useQueryClient();
  const chave = ["reducao", evento.id];
  const dados = useQuery({
    queryKey: chave,
    queryFn: () => reducaoObter({ data: { eventoId: evento.id } }),
  });
  const [editando, setEditando] = useState<{ id: string | null; dados: Medida } | null>(null);
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: chave }),
      qc.invalidateQueries({ queryKey: ["linha-do-tempo", evento.id] }),
    ]);
  const remover = useMutation({
    mutationFn: (id: string) =>
      gestaoRemover({ data: { eventoId: evento.id, tipo: "medida", id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  if (dados.isLoading) return <Carregando />;
  if (!dados.data) return <Falha erro={dados.error} />;
  const { medidas, calculo: c, exAntePorCategoria } = dados.data;
  const total = exAntePorCategoria
    ? Object.values(exAntePorCategoria).reduce((a, b) => a + b, 0)
    : 0;
  const ranking = exAntePorCategoria
    ? Object.entries(exAntePorCategoria)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Pré-evento · Aba REDUÇÃO da Ferramenta"
        title="Plano de redução"
        description="Registre cada ação adotada para diminuir as emissões e o objetivo dela: evitar, reduzir, substituir ou remover. Informe a categoria atingida, quem responde e até quando. Depois do evento, registre o resultado."
        actions={
          evento.podeEditar && (
            <Button onClick={() => setEditando({ id: null, dados: medidaVazia() })}>
              <Plus className="size-4" /> Medida
            </Button>
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="eyebrow">Medidas registradas / com responsável e prazo</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {c.registradas} / {c.completas}
          </p>
        </div>
        <div className="panel p-4 sm:col-span-2">
          <p className="eyebrow">Exigência do nível {evento.nivel ?? ""}</p>
          <p className="mt-1 text-sm">{c.exigencia}</p>
          {c.conferencia && (
            <p
              className={cn(
                "mt-2 inline-block rounded-md px-2 py-0.5 text-sm",
                c.atendida
                  ? "bg-success-soft text-success-text"
                  : "bg-warning-soft text-warning-text",
              )}
            >
              {c.conferencia}
            </p>
          )}
        </div>
      </div>

      <Panel title="Medidas" hint={NOTA_DIFERENCA}>
        {medidas.length === 0 ? (
          <Vazio>Nenhuma medida registrada.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-2 font-medium">Nº</th>
                  <th className="py-2 pr-3 font-medium">Categoria</th>
                  <th className="py-2 pr-3 text-right font-medium">Ex-ante da categoria (tCO₂e)</th>
                  <th className="py-2 pr-3 font-medium">Ação adotada</th>
                  <th className="py-2 pr-3 font-medium">Objetivo</th>
                  <th className="py-2 pr-3 text-right font-medium">Meta (%)</th>
                  <th className="py-2 pr-3 text-right font-medium">Meta (tCO₂e)</th>
                  <th className="py-2 pr-3 font-medium">Responsável</th>
                  <th className="py-2 pr-3 font-medium">Prazo</th>
                  <th className="py-2 pr-3 font-medium">Resultado</th>
                  <th className="py-2 pr-3 text-right font-medium">Ex-post da categoria</th>
                  {evento.podeEditar && <th />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {medidas.map((m, i) => {
                  const l = c.linhas[i]!;
                  return (
                    <tr key={m.id} className="align-top">
                      <td className="py-2 pr-2 tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-3">{m.categoria ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{numero(l.exAnte, 3)}</td>
                      <td className="py-2 pr-3">
                        {m.acao}
                        {m.evidencia && (
                          <span className="block text-xs text-muted-foreground">{m.evidencia}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{m.objetivo ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{numero(m.metaPct, 1)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{numero(l.metaT, 3)}</td>
                      <td className="py-2 pr-3">{m.responsavel ?? "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {m.prazo ? formatarData(m.prazo) : "—"}
                      </td>
                      <td className="py-2 pr-3">{m.resultado ?? "—"}</td>
                      <td
                        className="py-2 pr-3 text-right text-muted-foreground"
                        title="Preenchido com o inventário ex-post"
                      >
                        {numero(l.exPost, 3)}
                      </td>
                      {evento.podeEditar && (
                        <td className="py-2 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const { id, ...dados } = m;
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
                              window.confirm("Remover esta medida?") && remover.mutate(m.id)
                            }
                          >
                            Remover
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Onde estão as emissões previstas"
        hint="Ex-ante por categoria, da maior para a menor: base para escolher onde agir primeiro."
      >
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            O inventário ex-ante ainda não tem emissões.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {ranking.map(([cat, v]) => (
                <tr key={cat}>
                  <td className="py-1.5">{cat}</td>
                  <td className="py-1.5 text-right tabular-nums">{numero(v, 3)} tCO₂e</td>
                  <td className="w-20 py-1.5 text-right text-muted-foreground tabular-nums">
                    {porcentagem(v / total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {editando && (
        <FormularioDaMedida inicial={editando} fechar={() => setEditando(null)} salvo={atualizar} />
      )}
    </>
  );
}

function FormularioDaMedida({
  inicial,
  fechar,
  salvo,
}: {
  inicial: { id: string | null; dados: Medida };
  fechar: () => void;
  salvo: () => Promise<unknown>;
}) {
  const evento = useEvento();
  const [d, setD] = useState<Medida>(inicial.dados);
  const mudar = <K extends keyof Medida>(k: K, v: Medida[K]) => setD((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: (dados: Medida) =>
      medidaSalvar({ data: { eventoId: evento.id, id: inicial.id, dados } }),
    onSuccess: async () => {
      await salvo();
      toast.success("Medida salva.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = medidaSchema.safeParse(d);
    if (!r.success) toast.error(r.error.issues[0]?.message ?? "Revise os campos.");
    else if (!r.data.acao) toast.error("Descreva a ação.");
    else salvar.mutate(r.data);
  };
  const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar medida" : "Nova medida"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-acao">Ação adotada (o que será feito)</Label>
            <Input
              id="m-acao"
              required
              maxLength={500}
              value={d.acao ?? ""}
              onChange={(e) => mudar("acao", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-cat">Categoria</Label>
            <select
              id="m-cat"
              className={sel}
              value={d.categoria ?? ""}
              onChange={(e) => mudar("categoria", e.target.value || null)}
            >
              <option value="">—</option>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-obj">Objetivo da medida</Label>
            <select
              id="m-obj"
              className={sel}
              value={d.objetivo ?? ""}
              onChange={(e) => mudar("objetivo", (e.target.value || null) as Medida["objetivo"])}
            >
              <option value="">—</option>
              {OBJETIVOS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-meta">Meta (%)</Label>
            <Input
              id="m-meta"
              type="number"
              min={0}
              max={100}
              step="any"
              value={d.metaPct ?? ""}
              onChange={(e) =>
                mudar("metaPct", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-resp">Responsável</Label>
            <Input
              id="m-resp"
              maxLength={200}
              value={d.responsavel ?? ""}
              onChange={(e) => mudar("responsavel", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-prazo">Prazo</Label>
            <Input
              id="m-prazo"
              type="date"
              value={d.prazo ?? ""}
              onChange={(e) => mudar("prazo", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-res">Resultado (depois do evento)</Label>
            <select
              id="m-res"
              className={sel}
              value={d.resultado ?? ""}
              onChange={(e) => mudar("resultado", (e.target.value || null) as Medida["resultado"])}
            >
              <option value="">—</option>
              {RESULTADOS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-ev">Evidência ou observação</Label>
            <Input
              id="m-ev"
              maxLength={1000}
              value={d.evidencia ?? ""}
              onChange={(e) => mudar("evidencia", e.target.value || null)}
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
