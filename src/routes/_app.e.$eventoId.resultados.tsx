/** Aba "4 - RESULTADOS" da Ferramenta: tudo calculado a partir do ex-post. */
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { AvisoDoExPost } from "@/components/telas/PosEvento";
import { useEvento } from "@/lib/evento-atual";
import { numero, porcentagem } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { posEventoObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/resultados")({
  head: () => ({ meta: [{ title: "Resultados" }] }),
  component: Resultados,
});

function Selo({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  if (ok === null) return <span className="text-muted-foreground">{children}</span>;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        ok ? "bg-success-soft text-success-text" : "bg-warning-soft text-warning-text",
      )}
    >
      {children}
    </span>
  );
}

function Resultados() {
  const evento = useEvento();
  const q = useQuery({
    queryKey: ["pos-evento", evento.id],
    queryFn: () => posEventoObter({ data: { eventoId: evento.id } }),
  });
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Falha erro={q.error} />;
  const { resultados: r, exPost } = q.data;
  const p = r.principais;
  const variacao = (v: number | null) =>
    v === null ? "—" : `${v > 0 ? "+" : ""}${porcentagem(v)}`;

  return (
    <>
      <PageHeader
        eyebrow="Pós-evento · Aba 4 da Ferramenta"
        title="Resultados do inventário"
        description="Tudo calculado automaticamente a partir do inventário ex-post."
      />
      <AvisoDoExPost existe={exPost.existe} fechadoEm={exPost.fechadoEm} eventoId={evento.id} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="panel p-4 sm:col-span-2 lg:col-span-1">
          <p className="eyebrow">Emissões totais do evento</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{numero(p.total, 2)} tCO₂e</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Resultado oficial. Informe sempre este número primeiro.
          </p>
        </div>
        <Numero
          rotulo="Estimativa feita antes do evento"
          valor={`${numero(p.exAnte, 2)} tCO₂e`}
          nota={`Diferença entre previsto e realizado: ${variacao(p.variacao)}. Negativo significa que emitiu menos que o previsto.`}
        />
        <Numero
          rotulo="CO₂ biogênico (informado à parte)"
          valor={`${numero(p.biogenico, 3)} t`}
          nota="Vem de biocombustíveis. Não entra no total."
        />
        <Numero
          rotulo="Emissões por participante"
          valor={`${numero(p.porParticipante, 2)} kgCO₂e`}
          nota="Indicador complementar."
        />
        <Numero
          rotulo="Emissões por participante-dia"
          valor={`${numero(p.porParticipanteDia, 2)} kgCO₂e`}
          nota="Indicador complementar."
        />
      </div>

      <Panel
        title="De onde vem a emissão"
        hint="Categorias com 5% ou mais do total são MATERIAIS: nos Níveis 3 e 4 exigem dado primário e evidência completa. As categorias que somam 80% do total são as PRIORITÁRIAS para o plano de redução."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Categoria</th>
                <th className="py-2 pr-3 text-right font-medium">Ex-ante (tCO₂e)</th>
                <th className="py-2 pr-3 text-right font-medium">Ex-post (tCO₂e)</th>
                <th className="w-48 py-2 pr-3 font-medium">% do total</th>
                <th className="py-2 pr-3 text-right font-medium">Variação</th>
                <th className="py-2 font-medium">Materialidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.categorias.map((c) => (
                <tr key={c.categoria}>
                  <td className="py-1.5 pr-3">{c.categoria}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{numero(c.exAnte, 3)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{numero(c.exPost, 3)}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-brand"
                          style={{ width: `${Math.min(100, (c.participacao ?? 0) * 100)}%` }}
                        />
                      </div>
                      <span className="w-14 text-right text-xs tabular-nums">
                        {porcentagem(c.participacao)}
                      </span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{variacao(c.variacao)}</td>
                  <td className="py-1.5 text-xs">
                    {c.material && <span className="block font-medium">SIM - material</span>}
                    {c.prioritaria && (
                      <span className="block text-muted-foreground">Prioritária</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Por escopo e por gás">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Recorte</th>
                <th className="py-2 pr-3 text-right font-medium">Ex-post (tCO₂e)</th>
                <th className="py-2 text-right font-medium">% do total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...r.escopos, ...r.gases].map((x) => (
                <tr key={x.recorte}>
                  <td className="py-1.5 pr-3">{x.recorte}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{numero(x.valor, 3)}</td>
                  <td className="py-1.5 text-right tabular-nums">{porcentagem(x.participacao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Qualidade do inventário"
          hint="Se um indicador ficar ABAIXO DO MÍNIMO, o inventário continua válido: o que muda é o limite da alegação pública."
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Indicador</th>
                <th className="py-2 pr-3 text-right font-medium">Valor obtido</th>
                <th className="py-2 pr-3 text-right font-medium">Mínimo do nível</th>
                <th className="py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Linha rotulo="Linhas preenchidas" valor={String(r.qualidade.linhas)} />
              <Linha
                rotulo="Linhas com aviso pendente"
                valor={String(r.qualidade.pendentes)}
                situacao={
                  <Selo ok={r.qualidade.pendentes === 0}>
                    {r.qualidade.pendentes === 0 ? "OK" : "Resolva antes de fechar"}
                  </Selo>
                }
              />
              <Linha
                rotulo="Emissões com dado primário (nota 4 ou 5)"
                valor={porcentagem(r.qualidade.primario)}
                minimo={porcentagem(r.qualidade.minimoPrimario, 0)}
                situacao={
                  r.qualidade.situacaoPrimario && (
                    <Selo ok={r.qualidade.situacaoPrimario === "OK"}>
                      {r.qualidade.situacaoPrimario}
                    </Selo>
                  )
                }
              />
              <Linha
                rotulo="Nota média de qualidade (apoio)"
                valor={numero(r.qualidade.notaMedia, 2)}
                situacao={<Selo ok={null}>Não há mínimo exigido</Selo>}
              />
              <Linha
                rotulo="Emissões estimadas (nota 2 ou menos)"
                valor={porcentagem(r.qualidade.estimadas)}
                situacao={<Selo ok={null}>Quanto menor, melhor</Selo>}
              />
              <Linha
                rotulo="Fontes com 5% ou mais sem dado medido"
                valor={String(r.qualidade.fontes5)}
                minimo={(evento.nivel ?? 0) >= 3 ? "0" : "-"}
                situacao={
                  <Selo
                    ok={
                      r.qualidade.situacaoFontes5 === "Não exigido neste nível"
                        ? null
                        : r.qualidade.situacaoFontes5 === "OK"
                    }
                  >
                    {r.qualidade.situacaoFontes5}
                  </Selo>
                }
              />
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            O mínimo de dado medido varia com o nível: 20% no mínimo impacto climático, 40% no baixo
            e 50% no médio e no alto.
          </p>
        </Panel>
      </div>

      <Panel title="Completude por categoria (inventário ex-post)">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Categoria</th>
                <th className="py-2 pr-3 text-right font-medium">Linhas lançadas</th>
                <th className="py-2 pr-3 text-right font-medium">Alertas pendentes</th>
                <th className="py-2 pr-3 text-right font-medium">Linhas sem evidência</th>
                <th className="py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.completude.map((c) => (
                <tr key={c.categoria}>
                  <td className="py-1.5 pr-3">{c.categoria}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.linhas}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.alertas}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{c.semEvidencia}</td>
                  <td className="py-1.5">
                    <Selo ok={c.situacao === "Completa" ? true : c.linhas === 0 ? null : false}>
                      {c.situacao}
                    </Selo>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  minimo = "-",
  situacao,
}: {
  rotulo: string;
  valor: string;
  minimo?: string;
  situacao?: ReactNode;
}) {
  return (
    <tr>
      <td className="py-1.5 pr-3">{rotulo}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{valor}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{minimo}</td>
      <td className="py-1.5">{situacao}</td>
    </tr>
  );
}
