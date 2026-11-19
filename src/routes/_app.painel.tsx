/** Painel gerencial do portfólio: números consolidados, pendências, metas e comparativo. */
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import { Carregando, Falha, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  avaliarMeta,
  avaliarPortfolio,
  consolidar,
  INDICADORES_DE_META,
  metaSchema,
  type Meta,
  type ResumoDoEvento,
} from "@/domain/painel";
import { useSessao } from "@/lib/sessao";
import { hojeISO, numero, porcentagem } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { metaRemover, metaSalvar, painelObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/painel")({
  head: () => ({ meta: [{ title: "Painel gerencial" }] }),
  component: Painel,
});

const formatarMeta = (unidade: string, v: number | null) =>
  v === null
    ? "—"
    : unidade === "%"
      ? porcentagem(v)
      : unidade === "nota"
        ? numero(v, 2)
        : numero(v, 1);

function Painel() {
  const { perfil } = useSessao();
  const hoje = hojeISO();
  const q = useQuery({
    queryKey: ["painel", hoje],
    queryFn: () => painelObter({ data: { hoje } }),
  });
  const anos = useMemo(() => {
    const s = new Set<number>([Number(hoje.slice(0, 4))]);
    for (const e of q.data?.eventos ?? []) s.add(Number(e.dataInicio.slice(0, 4)));
    for (const m of q.data?.metas ?? []) s.add(m.ano);
    return [...s].sort((a, b) => b - a);
  }, [q.data, hoje]);
  const [ano, setAno] = useState<number | "todos">(Number(hoje.slice(0, 4)));
  const [editando, setEditando] = useState<{ id: string | null; dados: Meta } | null>(null);

  const eventos = useMemo(
    () =>
      (q.data?.eventos ?? []).filter(
        (e) => ano === "todos" || Number(e.dataInicio.slice(0, 4)) === ano,
      ),
    [q.data, ano],
  );
  const c = useMemo(() => consolidar(eventos), [eventos]);
  const metasDoAno = (q.data?.metas ?? []).filter((m) => ano === "todos" || m.ano === ano);
  const avaliacao = useMemo(
    () => avaliarPortfolio(metasDoAno, q.data?.eventos ?? []),
    [metasDoAno, q.data],
  );

  return (
    <Shell>
      <PageHeader
        eyebrow="Portfólio"
        title="Painel gerencial"
        description="Visão consolidada dos eventos que você acompanha: emissões, metas, qualidade, ESG e o que precisa de atenção."
        actions={
          <select
            aria-label="Ano dos eventos"
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            value={String(ano)}
            onChange={(e) => setAno(e.target.value === "todos" ? "todos" : Number(e.target.value))}
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                Eventos de {a}
              </option>
            ))}
            <option value="todos">Todos os anos</option>
          </select>
        }
      />
      {q.isLoading && <Carregando />}
      {q.error && <Falha erro={q.error} />}
      {q.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero
              rotulo="Eventos"
              valor={String(c.eventos)}
              nota={`${c.porFase["Pré-evento"]} no pré-evento · ${c.porFase["Execução"]} em execução · ${c.porFase["Pós-evento"]} no pós-evento`}
            />
            <Numero
              rotulo="Emissões oficiais"
              valor={`${numero(c.emissoesOficiais, 1)} tCO₂e`}
              nota={`Soma dos ${c.eventosComInventarioOficial} inventário(s) ex-post fechado(s).`}
            />
            <Numero
              rotulo="Compensação completa"
              valor={`${c.compensacaoCompleta} de ${c.eventos}`}
              nota="Quantidade aposentada cobre as emissões."
            />
            <Numero
              rotulo="Relatórios finais"
              valor={`${c.relatoriosFinais} de ${c.eventos}`}
              nota={`Níveis: ${c.porNivel.map((n, i) => `${i + 1}: ${n}`).join(" · ")}${c.semNivel ? ` · sem nível: ${c.semNivel}` : ""}`}
            />
          </div>

          <Pendencias eventos={eventos} c={c} />

          <Panel
            title="Metas do portfólio"
            hint="Cada meta vale para os eventos que começam no ano dela."
            actions={
              perfil?.adminPlataforma && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEditando({
                      id: null,
                      dados: {
                        ano: ano === "todos" ? Number(hoje.slice(0, 4)) : ano,
                        indicador: "intensidade",
                        alvo: 0,
                        observacao: null,
                      },
                    })
                  }
                >
                  <Plus className="size-4" /> Meta
                </Button>
              )
            }
          >
            {avaliacao.length === 0 ? (
              <Vazio>
                {perfil?.adminPlataforma
                  ? "Nenhuma meta definida para este período."
                  : "A administração ainda não definiu metas para este período."}
              </Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Ano</th>
                      <th className="py-2 pr-3 font-medium">Indicador</th>
                      <th className="py-2 pr-3 text-right font-medium">Meta</th>
                      <th className="w-56 py-2 pr-3 font-medium">Eventos que atingem</th>
                      {perfil?.adminPlataforma && <th />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {avaliacao.map((a) => {
                      const ind = INDICADORES_DE_META.find((x) => x.id === a.meta.indicador)!;
                      const meta = (q.data.metas.find(
                        (m) => m.ano === a.meta.ano && m.indicador === a.meta.indicador,
                      ) ?? null) as (Meta & { id: string }) | null;
                      return (
                        <tr key={`${a.meta.ano}-${a.meta.indicador}`} className="align-top">
                          <td className="py-2 pr-3 tabular-nums">{a.meta.ano}</td>
                          <td className="py-2 pr-3">
                            {ind.nome}
                            {a.meta.observacao && (
                              <span className="block text-xs text-muted-foreground">
                                {a.meta.observacao}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                            {ind.direcao === "maximo" ? "até " : "a partir de "}
                            {formatarMeta(ind.unidade, a.meta.alvo)}
                            {ind.unidade === "kgCO₂e" ? " kgCO₂e" : ""}
                          </td>
                          <td className="py-2 pr-3">
                            <Medidor atingem={a.atingem} comDado={a.comDado} total={a.total} />
                          </td>
                          {perfil?.adminPlataforma && (
                            <td className="py-2 text-right whitespace-nowrap">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  meta &&
                                  setEditando({
                                    id: meta.id,
                                    dados: {
                                      ano: meta.ano,
                                      indicador: meta.indicador,
                                      alvo: meta.alvo,
                                      observacao: meta.observacao,
                                    },
                                  })
                                }
                              >
                                Editar
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

          <Comparativo
            eventos={eventos}
            meta={
              ano === "todos"
                ? null
                : (metasDoAno.find((m) => m.indicador === "intensidade")?.alvo ?? null)
            }
          />

          <TabelaDeEventos eventos={eventos} metas={metasDoAno} />
        </>
      )}
      {editando && <FormularioDaMeta inicial={editando} fechar={() => setEditando(null)} />}
    </Shell>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

/** Proporção de eventos que atingem a meta, entre os que têm o dado. */
function Medidor({ atingem, comDado, total }: { atingem: number; comDado: number; total: number }) {
  const parte = comDado ? atingem / comDado : 0;
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-muted" aria-hidden>
        <div
          className={cn(
            "h-2 rounded-full",
            parte >= 1 ? "bg-success-text" : parte >= 0.5 ? "bg-warning-text" : "bg-danger-text",
          )}
          style={{ width: `${parte * 100}%` }}
        />
      </div>
      <p className="text-xs tabular-nums">
        {atingem} de {comDado} com dado
        {total > comDado ? ` · ${total - comDado} sem dado` : ""}
      </p>
    </div>
  );
}

function Pendencias({
  eventos,
  c,
}: {
  eventos: ResumoDoEvento[];
  c: ReturnType<typeof consolidar>;
}) {
  const linhas: { rotulo: string; n: number; eventos: ResumoDoEvento[]; tela: string }[] = [
    {
      rotulo: "Ações do plano atrasadas",
      n: c.pendencias.acoesAtrasadas,
      eventos: eventos.filter((e) => e.pendencias.acoesAtrasadas > 0),
      tela: "plano-de-acao",
    },
    {
      rotulo: "Ocorrências abertas ou em tratamento",
      n: c.pendencias.ocorrenciasAbertas,
      eventos: eventos.filter((e) => e.pendencias.ocorrenciasAbertas > 0),
      tela: "ocorrencias",
    },
    {
      rotulo: "Fornecedores com prazo de dados vencido",
      n: c.pendencias.fornecedoresAtrasados,
      eventos: eventos.filter((e) => e.pendencias.fornecedoresAtrasados > 0),
      tela: "fornecedores",
    },
    {
      rotulo: "Eventos encerrados com o ex-post aberto",
      n: c.pendencias.inventariosAbertos,
      eventos: eventos.filter((e) => e.pendencias.inventarioAberto),
      tela: "inventario-ex-post",
    },
    {
      rotulo: "Eventos encerrados com ESG essencial pendente",
      n: c.pendencias.esgPendente,
      eventos: eventos.filter((e) => e.fase === "Pós-evento" && e.esg.essenciaisPendentes.length),
      tela: "esg",
    },
  ];
  const abertas = linhas.filter((l) => l.n > 0);
  return (
    <Panel title="O que precisa de atenção">
      {abertas.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-success-text">
          <CheckCircle2 className="size-4" /> Nenhuma pendência de gestão nos eventos deste período.
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {abertas.map((l) => (
            <li key={l.rotulo} className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 shrink-0 text-warning-text" />
                {l.rotulo}: <span className="tabular-nums">{l.n}</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {l.eventos.map((e) => (
                  <Link
                    key={e.id}
                    to={`/e/$eventoId/${l.tela}` as "/e/$eventoId/esg"}
                    params={{ eventoId: e.id }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    <span className="size-2 rounded-full" style={{ background: e.cor }} />
                    {e.nome}
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Comparativo por intensidade (kgCO₂e por participante-dia): o total
 * favoreceria os eventos menores. Uma série, com a estimativa ex-ante em tom
 * mais claro quando ainda não há ex-post.
 */
function Comparativo({ eventos, meta }: { eventos: ResumoDoEvento[]; meta: number | null }) {
  const [foco, setFoco] = useState<string | null>(null);
  const comValor = eventos
    .filter((e) => e.emissoes.porParticipanteDia !== null)
    .sort((a, b) => b.emissoes.porParticipanteDia! - a.emissoes.porParticipanteDia!);
  const semValor = eventos.length - comValor.length;
  const maximo = Math.max(meta ?? 0, ...comValor.map((e) => e.emissoes.porParticipanteDia!), 1);
  const temEstimativa = comValor.some((e) => e.emissoes.fonte === "ex_ante");
  return (
    <Panel
      title="Emissões por participante-dia (kgCO₂e)"
      hint={`Compara eventos de tamanhos diferentes.${semValor ? ` ${semValor} evento(s) sem inventário ou sem público informado não aparecem.` : ""}`}
    >
      {comValor.length === 0 ? (
        <Vazio>Nenhum evento com inventário e público informados neste período.</Vazio>
      ) : (
        <div className="space-y-3">
          {temEstimativa && (
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm bg-brand" /> Inventário ex-post
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm bg-brand opacity-40" /> Estimativa ex-ante
              </span>
            </div>
          )}
          <div className="relative space-y-1.5 [--rotulo:7rem] [--valor:3rem] sm:[--rotulo:12rem] sm:[--valor:4.5rem]">
            {meta !== null && (
              <div
                className="pointer-events-none absolute inset-y-0 border-l border-foreground/60"
                style={{
                  left: `calc(var(--rotulo) + (100% - var(--rotulo) - var(--valor)) * ${meta / maximo})`,
                }}
                aria-hidden
              >
                <span className="absolute -top-5 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted-foreground">
                  Meta {numero(meta, 1)}
                </span>
              </div>
            )}
            {comValor.map((e) => {
              const v = e.emissoes.porParticipanteDia!;
              const ativo = foco === e.id;
              return (
                <div
                  key={e.id}
                  className="group grid grid-cols-[var(--rotulo)_minmax(0,1fr)_var(--valor)] items-center gap-0 rounded focus-visible:outline-2"
                  tabIndex={0}
                  onMouseEnter={() => setFoco(e.id)}
                  onMouseLeave={() => setFoco(null)}
                  onFocus={() => setFoco(e.id)}
                  onBlur={() => setFoco(null)}
                  aria-label={`${e.nome}: ${numero(v, 1)} kgCO₂e por participante-dia (${e.emissoes.fonte === "ex_post" ? "ex-post" : "estimativa ex-ante"})`}
                >
                  <span className="flex min-w-0 items-center gap-1.5 pr-3 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: e.cor }} />
                    <span className="truncate">{e.nome}</span>
                  </span>
                  <span className="relative h-5">
                    <span
                      className={cn(
                        "absolute inset-y-0.5 left-0 rounded-r bg-brand transition-opacity",
                        e.emissoes.fonte === "ex_ante" && "opacity-40",
                      )}
                      style={{ width: `max(2px, ${(v / maximo) * 100}%)` }}
                    />
                    {ativo && (
                      <span className="absolute -top-8 left-0 z-10 rounded-md border border-border bg-card px-2 py-1 text-xs whitespace-nowrap shadow">
                        {e.nome} · {numero(v, 1)} kgCO₂e ·{" "}
                        {e.emissoes.fonte === "ex_post"
                          ? e.emissoes.fechado
                            ? "ex-post fechado"
                            : "ex-post em aberto"
                          : "estimativa ex-ante"}
                        {e.emissoes.total !== null &&
                          ` · total ${numero(e.emissoes.total, 2)} tCO₂e`}
                      </span>
                    )}
                  </span>
                  <span className="pl-2 text-right text-sm tabular-nums">{numero(v, 1)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Celula({
  children,
  destaque,
}: {
  children: ReactNode;
  destaque?: "atinge" | "nao_atinge" | undefined;
}) {
  return (
    <td
      className={cn(
        "py-2 pr-3 text-right tabular-nums",
        destaque === "nao_atinge" && "font-medium text-danger-text",
      )}
    >
      {children}
      {destaque === "nao_atinge" && <span className="sr-only"> (abaixo da meta)</span>}
    </td>
  );
}

function TabelaDeEventos({ eventos, metas }: { eventos: ResumoDoEvento[]; metas: Meta[] }) {
  const resultado = (e: ResumoDoEvento, indicador: string) => {
    const m = metas.find(
      (x) => x.indicador === indicador && x.ano === Number(e.dataInicio.slice(0, 4)),
    );
    return m ? avaliarMeta(m, e).resultado : undefined;
  };
  const d = (e: ResumoDoEvento, i: string) => {
    const r = resultado(e, i);
    return r === "atinge" || r === "nao_atinge" ? r : undefined;
  };
  return (
    <Panel title="Eventos" hint="Valores fora da meta aparecem em vermelho.">
      {eventos.length === 0 ? (
        <Vazio>Nenhum evento neste período.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Evento</th>
                <th className="py-2 pr-3 font-medium">Fase · nível</th>
                <th className="py-2 pr-3 text-right font-medium">Emissões (tCO₂e)</th>
                <th className="py-2 pr-3 text-right font-medium">kgCO₂e / part.-dia</th>
                <th className="py-2 pr-3 text-right font-medium">Previsto × realizado</th>
                <th className="py-2 pr-3 text-right font-medium">Dado primário</th>
                <th className="py-2 pr-3 text-right font-medium">Mão de obra local</th>
                <th className="py-2 pr-3 text-right font-medium">Gasto local</th>
                <th className="py-2 pr-3 text-right font-medium">Satisfação</th>
                <th className="py-2 pl-3 font-medium">Relatório final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3">
                    <Link
                      to="/e/$eventoId"
                      params={{ eventoId: e.id }}
                      className="flex items-center gap-1.5 font-medium hover:underline"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: e.cor }}
                      />
                      {e.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {e.fase} · {e.nivel ? `Nível ${e.nivel}` : "sem nível"}
                  </td>
                  <Celula>
                    {numero(e.emissoes.total, 2)}
                    {e.emissoes.fonte === "ex_ante" && (
                      <span className="block text-[11px] text-muted-foreground">estimativa</span>
                    )}
                  </Celula>
                  <Celula destaque={d(e, "intensidade")}>
                    {numero(e.emissoes.porParticipanteDia, 1)}
                  </Celula>
                  <Celula destaque={d(e, "variacao")}>
                    {e.variacao === null
                      ? "—"
                      : `${e.variacao > 0 ? "+" : ""}${porcentagem(e.variacao)}`}
                  </Celula>
                  <Celula destaque={d(e, "primario")}>{porcentagem(e.primario)}</Celula>
                  <Celula destaque={d(e, "mao_de_obra_local")}>
                    {porcentagem(e.esg.maoDeObraLocal)}
                  </Celula>
                  <Celula destaque={d(e, "gasto_local")}>{porcentagem(e.esg.gastoLocal)}</Celula>
                  <Celula destaque={d(e, "satisfacao")}>{numero(e.esg.satisfacao, 2)}</Celula>
                  <td className="py-2 pl-3 text-xs">{e.relatorioFinal ? "Emitido" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function FormularioDaMeta({
  inicial,
  fechar,
}: {
  inicial: { id: string | null; dados: Meta };
  fechar: () => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState(inicial.dados);
  const ind = INDICADORES_DE_META.find((x) => x.id === d.indicador)!;
  const percentual = ind.unidade === "%";
  // Percentuais são digitados em % e guardados em fração.
  const [texto, setTexto] = useState(
    String(percentual ? Number((inicial.dados.alvo * 100).toFixed(4)) : inicial.dados.alvo),
  );
  const atualizar = () => qc.invalidateQueries({ queryKey: ["painel"] });
  const salvar = useMutation({
    mutationFn: (dados: Meta) => metaSalvar({ data: { id: inicial.id, dados } }),
    onSuccess: async () => {
      await atualizar();
      toast.success("Meta salva.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: () => metaRemover({ data: { id: inicial.id! } }),
    onSuccess: async () => {
      await atualizar();
      toast.success("Meta removida.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const enviar = () => {
    const n = Number(texto.replace(",", "."));
    const r = metaSchema.safeParse({ ...d, alvo: percentual ? n / 100 : n });
    if (!texto.trim() || !Number.isFinite(n) || !r.success) {
      toast.error(r.success ? "Informe a meta." : (r.error.issues[0]?.message ?? "Revise."));
      return;
    }
    salvar.mutate(r.data);
  };
  const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar meta" : "Nova meta"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="m-ano">Ano</Label>
            <Input
              id="m-ano"
              type="number"
              value={d.ano}
              onChange={(e) => setD({ ...d, ano: Number(e.target.value) || d.ano })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-ind">Indicador</Label>
            <select
              id="m-ind"
              className={sel}
              value={d.indicador}
              onChange={(e) => setD({ ...d, indicador: e.target.value })}
            >
              {INDICADORES_DE_META.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-alvo">
              Meta ({ind.direcao === "maximo" ? "no máximo" : "no mínimo"},{" "}
              {ind.unidade === "%" ? "em %" : ind.unidade === "nota" ? "nota de 1 a 5" : "kgCO₂e"})
            </Label>
            <Input
              id="m-alvo"
              inputMode="decimal"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{ind.ajuda}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="m-obs">Observação</Label>
            <Input
              id="m-obs"
              maxLength={500}
              value={d.observacao ?? ""}
              onChange={(e) => setD({ ...d, observacao: e.target.value || null })}
            />
          </div>
          <div className="flex justify-between gap-2 sm:col-span-2">
            {inicial.id ? (
              <Button
                variant="ghost"
                disabled={remover.isPending}
                onClick={() => window.confirm("Remover esta meta?") && remover.mutate()}
              >
                Remover
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={salvar.isPending} onClick={enviar}>
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
