/** Uma versão do relatório: leitura, impressão (PDF) e planilha (XLSX). */
import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Carregando, Falha, formatarData, formatarDataHora } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { NOTAS_DA_FRASE } from "@/domain/metodologia/relatorio";
import { AVISOS_DA_COMPENSACAO } from "@/domain/metodologia/posEvento";
import { correspondencia, NOME_DA_SITUACAO, SECOES, type Situacao } from "@/domain/relatorio";
import { useEvento } from "@/lib/evento-atual";
import { numero, porcentagem } from "@/lib/formatar";
import { abasDoRelatorio } from "@/lib/planilha-do-relatorio";
import { cn } from "@/lib/utils";
import { gerarXlsx } from "@/lib/xlsx";
import { relatorioObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/relatorios/$relatorioId")({
  head: () => ({ meta: [{ title: "Relatório" }] }),
  component: Relatorio,
});

const TOM: Record<Situacao, string> = {
  atendido: "bg-success-soft text-success-text",
  parcial: "bg-warning-soft text-warning-text",
  nao_coberto: "bg-muted text-muted-foreground",
};

function Relatorio() {
  const evento = useEvento();
  const { relatorioId } = Route.useParams();
  const q = useQuery({
    queryKey: ["relatorio", relatorioId],
    queryFn: () => relatorioObter({ data: { eventoId: evento.id, id: relatorioId } }),
  });
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Falha erro={q.error} />;
  const r = q.data;
  const d = r.dados;
  const cab = {
    numero: r.numero,
    tipo: r.tipo,
    framework: r.framework,
    geradoEm: r.geradoEm,
    geradoPor: r.geradoPor,
    hash: r.hash,
  };

  const baixarXlsx = () => {
    const bytes = gerarXlsx(abasDoRelatorio(d, cab));
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${d.evento.nome.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-v${r.numero}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="space-y-6">
      <div className="nao-imprimir flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/e/$eventoId/relatorios" params={{ eventoId: evento.id }}>
            <ArrowLeft className="size-4" /> Relatórios
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={baixarXlsx}>
            <FileSpreadsheet className="size-4" /> Baixar XLSX
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir / salvar PDF
          </Button>
        </div>
      </div>

      <header className="border-b border-border pb-4" style={{ borderColor: evento.cor }}>
        <p className="eyebrow">
          Relatório {r.tipo === "final" ? "final" : "preliminar"} · versão {r.numero} ·{" "}
          {r.framework}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{d.evento.nome}</h1>
        <p className="text-sm text-muted-foreground">
          {d.evento.instituicao} · {d.evento.cidade}/{d.evento.uf} ·{" "}
          {formatarData(d.evento.dataInicio)} a {formatarData(d.evento.dataFim)}
        </p>
        <p
          className={cn(
            "mt-3 flex items-center gap-2 text-xs",
            r.integro ? "text-muted-foreground" : "font-medium text-danger-text",
          )}
        >
          {r.integro ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
          {r.integro
            ? "Integridade conferida: o conteúdo é o mesmo da geração."
            : "ATENÇÃO: o conteúdo não confere com o código de integridade. Esta versão foi alterada fora do sistema."}
        </p>
        <p className="text-xs break-all text-muted-foreground">
          Gerado em {formatarDataHora(r.geradoEm)} por {r.geradoPor} · SHA-256 {r.hash}
        </p>
        {!d.exPost.fechadoEm && (
          <p className="mt-2 rounded-lg bg-warning-soft p-2 text-xs text-warning-text">
            Versão preliminar: o inventário ex-post ainda estava aberto quando ela foi gerada.
          </p>
        )}
      </header>

      <Secao titulo={SECOES.evento}>
        <Tabela
          linhas={[
            ["Nível do evento", d.evento.designacao ?? "Não confirmado"],
            ["Responsável pela gestão climática", d.evento.responsavel ?? "—"],
            ["Ano do inventário", String(d.base.ano)],
            ["Participantes", numero(d.publico.participantes, 0)],
            ["Metodologia", d.metodologia],
            ["Fonte dos fatores de emissão", d.base.nome],
            ["Referência de GWP", d.base.referenciaGwp],
          ]}
        />
      </Secao>

      <Secao titulo={SECOES.emissoes}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Destaque
            rotulo="Emissões brutas do evento"
            valor={`${numero(d.resultados.principais.total, 3)} tCO₂e`}
          />
          <Destaque
            rotulo="Por participante"
            valor={`${numero(d.resultados.principais.porParticipante, 2)} kgCO₂e`}
          />
          <Destaque
            rotulo="Por participante-dia"
            valor={`${numero(d.resultados.principais.porParticipanteDia, 2)} kgCO₂e`}
          />
        </div>
        <Tabela
          cabecalho={["Recorte", "tCO₂e", "% do total"]}
          linhas={[...d.resultados.escopos, ...d.resultados.gases].map((x) => [
            x.recorte,
            numero(x.valor, 3),
            porcentagem(x.participacao),
          ])}
        />
        <p className="text-xs text-muted-foreground">
          CO₂ biogênico informado à parte, fora do total:{" "}
          {numero(d.resultados.principais.biogenico, 3)} t.
        </p>
        <Tabela
          cabecalho={["Categoria", "Ex-post (tCO₂e)", "% do total", "Materialidade"]}
          linhas={d.resultados.categorias.map((c) => [
            c.categoria,
            numero(c.exPost, 3),
            porcentagem(c.participacao),
            [c.material ? "SIM - material" : "", c.prioritaria ? "prioritária" : ""]
              .filter(Boolean)
              .join(" · "),
          ])}
        />
      </Secao>

      <Secao titulo={SECOES.qualidade}>
        <Tabela
          cabecalho={["Indicador", "Valor", "Mínimo do nível", "Situação"]}
          linhas={[
            [
              "Emissões com dado primário (nota 4 ou 5)",
              porcentagem(d.resultados.qualidade.primario),
              porcentagem(d.resultados.qualidade.minimoPrimario, 0),
              d.resultados.qualidade.situacaoPrimario ?? "—",
            ],
            [
              "Nota média de qualidade",
              numero(d.resultados.qualidade.notaMedia, 2),
              "-",
              "Não há mínimo exigido",
            ],
            [
              "Emissões estimadas (nota 2 ou menos)",
              porcentagem(d.resultados.qualidade.estimadas),
              "-",
              "",
            ],
            [
              "Fontes com 5% ou mais sem dado medido",
              String(d.resultados.qualidade.fontes5),
              (d.evento.nivel ?? 0) >= 3 ? "0" : "-",
              d.resultados.qualidade.situacaoFontes5,
            ],
            ["Linhas com aviso pendente", String(d.resultados.qualidade.pendentes), "-", ""],
          ]}
        />
        <Tabela
          cabecalho={["Categoria", "Linhas", "Alertas", "Sem evidência", "Situação"]}
          linhas={d.resultados.completude.map((c) => [
            c.categoria,
            String(c.linhas),
            String(c.alertas),
            String(c.semEvidencia),
            c.situacao,
          ])}
        />
      </Secao>

      <Secao titulo={SECOES.comparacao}>
        {d.comparacao ? (
          <Tabela
            cabecalho={[
              "Categoria",
              "Ex-ante",
              "Ex-post",
              "Diferença",
              "%",
              "Origem",
              "Explicação",
            ]}
            linhas={[
              ...d.comparacao.categorias.map((c) => [
                c.categoria,
                numero(c.exAnte, 3),
                numero(c.exPost, 3),
                numero(c.diferenca, 3),
                porcentagem(c.pct),
                c.origem ?? "—",
                c.explicacao ?? "",
              ]),
              [
                "TOTAL",
                numero(d.comparacao.total.exAnte, 3),
                numero(d.comparacao.total.exPost, 3),
                numero(d.comparacao.total.diferenca, 3),
                porcentagem(d.comparacao.total.pct),
                "",
                "",
              ],
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">O evento não tem inventário ex-ante.</p>
        )}
      </Secao>

      <Secao titulo={SECOES.reducao}>
        <p className="text-sm">
          <span className="font-medium">Exigência do nível:</span> {d.reducao.exigencia}.{" "}
          {d.reducao.conferencia}
        </p>
        {d.reducao.medidas.length > 0 && (
          <Tabela
            cabecalho={["Categoria", "Medida", "Meta", "Responsável", "Prazo", "Resultado"]}
            linhas={d.reducao.medidas.map((m) => [
              m.categoria ?? "—",
              m.acao ?? "",
              m.metaPct ? `${numero(m.metaPct, 1)}% (${numero(m.metaT, 3)} tCO₂e)` : "—",
              m.responsavel ?? "—",
              m.prazo ? formatarData(m.prazo) : "—",
              m.resultado ?? "—",
            ])}
          />
        )}
        {d.temas.length > 0 && (
          <Tabela
            cabecalho={["Tema material", "Categoria", "Impacto", "Relevância", "Prioridade"]}
            linhas={d.temas.map((t) => [
              t.tema,
              t.categoria ?? "Fora do GEE",
              String(t.impacto),
              String(t.relevancia),
              t.prioridade,
            ])}
          />
        )}
        {d.acoes.length > 0 && (
          <Tabela
            cabecalho={["Ação", "Responsável", "Prazo", "Situação", "Progresso"]}
            linhas={d.acoes.map((a) => [
              a.acao,
              a.responsavel ?? "—",
              a.prazo ? formatarData(a.prazo) : "—",
              a.situacao,
              `${a.progresso}%`,
            ])}
          />
        )}
        <Tabela
          cabecalho={["Checklist do nível", "Itens", "Progresso"]}
          linhas={d.checklist.map((f) => [
            f.nome,
            String(f.itens),
            `${porcentagem(f.progresso, 0)}${f.concluida ? " · concluída" : ""}`,
          ])}
        />
      </Secao>

      <Secao titulo={SECOES.compensacao}>
        <Tabela
          linhas={[
            ["Emissões residuais", `${numero(d.compensacao.residuais, 3)} tCO₂e`],
            ["Quantidade a compensar", `${numero(d.compensacao.aCompensar, 0)} t`],
            [
              "Quantidade compensada e aposentada",
              `${numero(d.compensacao.aposentadaT ?? 0, 3)} tCO₂e`,
            ],
            ["Comprovante da aposentadoria", d.compensacao.comprovante ?? "—"],
            ["Saldo não compensado", `${numero(d.compensacao.saldo, 3)} tCO₂e`],
            ...((d.compensacao.omissaoT ?? 0) > 0
              ? [
                  [
                    "Parcela não abatida por omissão",
                    `${numero(d.compensacao.omissaoT, 3)} tCO₂e — ${d.compensacao.omissaoDescricao ?? ""}`,
                  ],
                ]
              : []),
          ]}
        />
        <div className="rounded-lg border-2 border-border p-4">
          <p className="eyebrow">Frase que você pode usar</p>
          <p className="mt-1 text-lg font-semibold">{d.frase}</p>
        </div>
        {d.avisoAlegacao && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {d.avisoAlegacao}
          </p>
        )}
        <ul className="space-y-1 text-xs text-muted-foreground">
          {[...NOTAS_DA_FRASE, AVISOS_DA_COMPENSACAO[1]!].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Secao>

      <Secao titulo={SECOES.ocorrencias}>
        {d.ocorrencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
        ) : (
          <Tabela
            cabecalho={["Data", "Ocorrência", "Impacto", "Ação adotada", "Premissa", "Situação"]}
            linhas={d.ocorrencias.map((o) => [
              o.data ? formatarData(o.data) : "—",
              o.ocorrencia,
              o.impacto ?? "—",
              o.acao ?? "—",
              o.premissa ?? "—",
              o.situacao,
            ])}
          />
        )}
      </Secao>

      <Secao titulo={SECOES.memoria} quebra>
        <Tabela
          cabecalho={[
            "Nº",
            "Item",
            "Quantidade",
            "Conta (tCO₂e)",
            "Total",
            "Fonte do fator",
            "Qualidade",
            "Evidência",
          ]}
          linhas={d.memoria.map((m) => [
            String(m.ordem),
            `${m.item}${m.descricao ? ` · ${m.descricao}` : ""}`,
            `${numero(m.quantidade, 3)} ${m.unidade ?? ""}`,
            m.formula,
            numero(m.total, 4),
            m.fonteDoFator,
            m.qualidade ?? "—",
            m.evidencia ?? "—",
          ])}
        />
        <p className="text-xs text-muted-foreground">
          GWP CH₄ = {d.base.gwpCh4}; GWP N₂O = {d.base.gwpN2o} ({d.base.referenciaGwp}).{" "}
          {d.base.avisoSin}
        </p>
      </Secao>

      <section className="quebra-antes space-y-4">
        <h2 className="text-lg font-semibold">Correspondência com o framework</h2>
        {correspondencia(r.framework, d).map((t) => (
          <div key={t.titulo} className="space-y-2">
            <h3 className="font-medium">{t.titulo}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Código</th>
                    <th className="py-1.5 pr-3 font-medium">Requisito</th>
                    <th className="py-1.5 pr-3 font-medium">Onde</th>
                    <th className="py-1.5 pr-3 font-medium">Situação</th>
                    <th className="py-1.5 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border align-top">
                  {t.itens.map((i) => (
                    <tr key={i.codigo}>
                      <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{i.codigo}</td>
                      <td className="py-1.5 pr-3">{i.requisito}</td>
                      <td className="py-1.5 pr-3 text-xs">{i.secao}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            TOM[i.situacao],
                          )}
                        >
                          {NOME_DA_SITUACAO[i.situacao]}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs">{i.observacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          A tabela indica onde cada requisito é tratado neste relatório. Ela não substitui a
          verificação por terceira parte nem a leitura das normas.
        </p>
      </section>
    </article>
  );
}

function Secao({
  titulo,
  quebra,
  children,
}: {
  titulo: string;
  quebra?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-3", quebra && "quebra-antes")}>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Destaque({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="eyebrow">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho?: string[]; linhas: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        {cabecalho && (
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              {cabecalho.map((c, i) => (
                <th key={i} className="py-1.5 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-border align-top">
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td
                  key={j}
                  className={cn(
                    "py-1.5 pr-3",
                    !cabecalho && j === 0 && "w-1/3 text-muted-foreground",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
