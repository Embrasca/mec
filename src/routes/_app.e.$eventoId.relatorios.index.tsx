/** Relatórios do evento: escolha do framework, geração de versões e histórico. */
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, formatarDataHora, PageHeader, Panel, Vazio } from "@/components/kit";
import { AvisoDoExPost } from "@/components/telas/PosEvento";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FRAMEWORKS, type Framework, type TipoDeRelatorio } from "@/domain/relatorio";
import { useEvento } from "@/lib/evento-atual";
import { hojeISO, numero } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { posEventoObter, relatorioGerar, relatoriosListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/relatorios/")({
  head: () => ({ meta: [{ title: "Relatórios" }] }),
  component: Relatorios,
});

const DESCRICAO_DO_FRAMEWORK: Record<Framework, string> = {
  "GRI + ISO 20121":
    "Inventário pelo GHG Protocol, com a correspondência aos conteúdos GRI 3 e GRI 305 e aos capítulos da ISO 20121.",
  GRI: "Inventário pelo GHG Protocol, com a correspondência aos conteúdos GRI 3 e GRI 305.",
  "ISO 20121":
    "Inventário pelo GHG Protocol, com a correspondência aos capítulos da ISO 20121 (sistema de gestão de eventos sustentáveis).",
  "GHG Protocol": "Só o inventário e a correspondência aos requisitos do GHG Protocol.",
};

function Relatorios() {
  const evento = useEvento();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const lista = useQuery({
    queryKey: ["relatorios", evento.id],
    queryFn: () => relatoriosListar({ data: { eventoId: evento.id } }),
  });
  const pos = useQuery({
    queryKey: ["pos-evento", evento.id],
    queryFn: () => posEventoObter({ data: { eventoId: evento.id } }),
  });
  const [framework, setFramework] = useState<Framework>("GRI + ISO 20121");
  const gerar = useMutation({
    mutationFn: (tipo: TipoDeRelatorio) =>
      relatorioGerar({ data: { eventoId: evento.id, tipo, framework, hoje: hojeISO() } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["relatorios", evento.id] });
      toast.success(`Versão ${r.numero} gerada.`);
      void navegar({
        to: "/e/$eventoId/relatorios/$relatorioId",
        params: { eventoId: evento.id, relatorioId: r.id },
      });
    },
    onError: (e) => toast.error(e.message),
  });

  if (lista.isLoading) return <Carregando />;
  if (!lista.data) return <Falha erro={lista.error} />;
  const exPostFechado = Boolean(pos.data?.exPost.fechadoEm);

  return (
    <>
      <PageHeader
        eyebrow="Relatórios · Aba 7 da Ferramenta"
        title="Relatórios do evento"
        description="Cada versão congela os números, a frase permitida e a memória de cálculo naquele momento, com um código de integridade. Versões não mudam nem são apagadas."
      />
      {pos.data && (
        <AvisoDoExPost
          existe={pos.data.exPost.existe}
          fechadoEm={pos.data.exPost.fechadoEm}
          eventoId={evento.id}
        />
      )}

      {evento.podeEditar && (
        <Panel title="Gerar uma versão">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="r-framework">Framework</Label>
              <select
                id="r-framework"
                value={framework}
                onChange={(e) => setFramework(e.target.value as Framework)}
                className="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {FRAMEWORKS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{DESCRICAO_DO_FRAMEWORK[framework]}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={gerar.isPending}
                onClick={() => gerar.mutate("preliminar")}
              >
                Gerar preliminar
              </Button>
              {evento.podeGerir && (
                <Button
                  disabled={gerar.isPending || !exPostFechado}
                  title={exPostFechado ? undefined : "Feche o inventário ex-post antes"}
                  onClick={() =>
                    window.confirm(
                      "Gerar o relatório final? Ele usa o inventário ex-post fechado e fica registrado como versão final.",
                    ) && gerar.mutate("final")
                  }
                >
                  Gerar final
                </Button>
              )}
            </div>
          </div>
          {evento.podeGerir && !exPostFechado && (
            <p className="mt-3 text-xs text-muted-foreground">
              O relatório final só sai do inventário oficial: feche o inventário ex-post antes.
            </p>
          )}
        </Panel>
      )}

      <Panel title="Versões">
        {lista.data.lista.length === 0 ? (
          <Vazio>Nenhuma versão gerada.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Versão</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Framework</th>
                  <th className="py-2 pr-3 text-right font-medium">Emissões (tCO₂e)</th>
                  <th className="py-2 pr-3 font-medium">Frase permitida</th>
                  <th className="py-2 pr-3 font-medium">Gerada</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.data.lista.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-medium tabular-nums">{r.numero}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          r.tipo === "final"
                            ? "bg-success-soft text-success-text"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {r.tipo === "final" ? "Final" : "Preliminar"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{r.framework}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{numero(r.total, 3)}</td>
                    <td className="py-2 pr-3">{r.frase}</td>
                    <td className="py-2 pr-3 text-xs">
                      {formatarDataHora(r.geradoEm)}
                      <span className="block text-muted-foreground">{r.geradoPor}</span>
                    </td>
                    <td className="py-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          to="/e/$eventoId/relatorios/$relatorioId"
                          params={{ eventoId: evento.id, relatorioId: r.id }}
                        >
                          <FileText className="size-4" /> Abrir
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
