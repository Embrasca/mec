/** Aba "5 - COMPARAÇÃO" da Ferramenta: por que o realizado foi diferente do previsto. */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { AvisoDoExPost } from "@/components/telas/PosEvento";
import {
  NOTA_PRESERVE_EX_ANTE,
  ORIGENS,
  SIGNIFICADO_DA_ORIGEM,
  type Desvio,
} from "@/domain/metodologia/posEvento";
import { useEvento } from "@/lib/evento-atual";
import { numero, porcentagem } from "@/lib/formatar";
import { desvioSalvar, posEventoObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/comparacao")({
  head: () => ({ meta: [{ title: "Comparação ex-ante × ex-post" }] }),
  component: Comparacao,
});

const sinal = (v: number | null, f: (x: number) => string) =>
  v === null ? "—" : `${v > 0 ? "+" : ""}${f(v)}`;

function Comparacao() {
  const evento = useEvento();
  const q = useQuery({
    queryKey: ["pos-evento", evento.id],
    queryFn: () => posEventoObter({ data: { eventoId: evento.id } }),
  });
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Falha erro={q.error} />;
  const { comparacao: c, exAnte, exPost } = q.data;

  return (
    <>
      <PageHeader
        eyebrow="Pós-evento · Aba 5 da Ferramenta"
        title="Análise de desvio"
        description="Por que o realizado foi diferente do previsto. Um número menor nem sempre significa bom desempenho: classifique a causa de cada diferença."
      />
      <AvisoDoExPost existe={exPost.existe} fechadoEm={exPost.fechadoEm} eventoId={evento.id} />
      {!exAnte.fechadoEm && (
        <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            O ex-ante ainda está aberto. Feche-o em{" "}
            <Link
              to="/e/$eventoId/inventario"
              params={{ eventoId: evento.id }}
              className="underline"
            >
              Inventário ex-ante
            </Link>{" "}
            para preservar a estimativa original.
          </span>
        </p>
      )}
      <Panel
        title="Ex-ante × ex-post por categoria"
        hint={
          c.semOrigem > 0
            ? `${c.semOrigem} categoria(s) com diferença ainda sem origem classificada.`
            : undefined
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Categoria</th>
                <th className="py-2 pr-3 text-right font-medium">Ex-ante (tCO₂e)</th>
                <th className="py-2 pr-3 text-right font-medium">Ex-post (tCO₂e)</th>
                <th className="py-2 pr-3 text-right font-medium">Diferença (tCO₂e)</th>
                <th className="py-2 pr-3 text-right font-medium">Diferença (%)</th>
                <th className="py-2 pr-3 font-medium">Origem do desvio</th>
                <th className="py-2 font-medium">Explicação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {c.categorias.map((x) => (
                <LinhaDeDesvio key={x.categoria} linha={x} />
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3">TOTAL</td>
                <td className="py-2 pr-3 text-right tabular-nums">{numero(c.total.exAnte, 3)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{numero(c.total.exPost, 3)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {sinal(c.total.diferenca, (v) => numero(v, 3))}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {sinal(c.total.pct, (v) => porcentagem(v))}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="O que cada origem significa">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {Object.entries(SIGNIFICADO_DA_ORIGEM).map(([o, s]) => (
            <div key={o}>
              <dt className="font-medium">{o}</dt>
              <dd className="text-muted-foreground">{s}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm">{NOTA_PRESERVE_EX_ANTE}</p>
      </Panel>
    </>
  );
}

function LinhaDeDesvio({
  linha,
}: {
  linha: {
    categoria: string;
    exAnte: number;
    exPost: number;
    diferenca: number;
    pct: number | null;
    origem: Desvio["origem"];
    explicacao: string | null;
  };
}) {
  const evento = useEvento();
  const qc = useQueryClient();
  const [origem, setOrigem] = useState<Desvio["origem"]>(linha.origem);
  const [explicacao, setExplicacao] = useState(linha.explicacao ?? "");
  const salvar = useMutation({
    mutationFn: (d: Pick<Desvio, "origem" | "explicacao">) =>
      desvioSalvar({ data: { eventoId: evento.id, dados: { categoria: linha.categoria, ...d } } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos-evento", evento.id] }),
    onError: (e) => toast.error(e.message),
  });
  const ro = !evento.podeEditar;
  return (
    <tr className="align-top">
      <td className="py-2 pr-3">{linha.categoria}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{numero(linha.exAnte, 3)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{numero(linha.exPost, 3)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {sinal(linha.diferenca, (v) => numero(v, 3))}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {sinal(linha.pct, (v) => porcentagem(v))}
      </td>
      <td className="py-2 pr-3">
        <select
          aria-label={`${linha.categoria}: origem do desvio`}
          disabled={ro}
          value={origem ?? ""}
          onChange={(e) => {
            const o = (e.target.value || null) as Desvio["origem"];
            setOrigem(o);
            salvar.mutate({ origem: o, explicacao: explicacao.trim() || null });
          }}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">—</option>
          {ORIGENS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </td>
      <td className="py-2">
        <input
          aria-label={`${linha.categoria}: explicação`}
          disabled={ro}
          value={explicacao}
          maxLength={2000}
          onChange={(e) => setExplicacao(e.target.value)}
          onBlur={() =>
            explicacao !== (linha.explicacao ?? "") &&
            salvar.mutate({ origem, explicacao: explicacao.trim() || null })
          }
          className="h-8 w-full min-w-56 rounded-md border border-input bg-transparent px-2 text-sm"
        />
      </td>
    </tr>
  );
}
