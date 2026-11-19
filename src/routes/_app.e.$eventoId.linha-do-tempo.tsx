/** Linha do tempo: prazos de todas as áreas do evento nas três fases. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Carregando, Falha, formatarData, PageHeader, Panel } from "@/components/kit";
import { Progress } from "@/components/ui/progress";
import type { FaseDoEvento } from "@/domain/gestao";
import { useEvento } from "@/lib/evento-atual";
import { hojeISO, porcentagem } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { linhaDoTempoObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/linha-do-tempo")({
  head: () => ({ meta: [{ title: "Linha do tempo" }] }),
  component: LinhaDoTempo,
});

const FASES: { fase: FaseDoEvento; checklist: string }[] = [
  { fase: "Pré-evento", checklist: "Pré-evento" },
  { fase: "Execução", checklist: "Execução" },
  { fase: "Pós-evento", checklist: "Pós-evento" },
];

function LinhaDoTempo() {
  const evento = useEvento();
  const hoje = hojeISO();
  const dados = useQuery({
    queryKey: ["linha-do-tempo", evento.id, hoje],
    queryFn: () => linhaDoTempoObter({ data: { eventoId: evento.id, hoje } }),
  });
  if (dados.isLoading) return <Carregando />;
  if (!dados.data) return <Falha erro={dados.error} />;
  const { linha, checklist } = dados.data;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Linha do tempo"
        description={`Pré-evento até ${formatarData(evento.dataInicio)}, execução de ${formatarData(evento.dataInicio)} a ${formatarData(evento.dataFim)} e pós-evento depois disso. Reúne os prazos do plano de redução, do plano de ação e da entrega de dados dos fornecedores.`}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {FASES.map(({ fase, checklist: nome }) => {
          const c = checklist.find((x) => x.fase === nome);
          const marcos = linha[fase];
          return (
            <Panel key={fase} title={fase}>
              {c && c.total > 0 ? (
                <div className="mb-4 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <Link
                      to="/e/$eventoId/checklist"
                      params={{ eventoId: evento.id }}
                      className="underline"
                    >
                      Checklist da fase
                    </Link>
                    <span className="tabular-nums">
                      {porcentagem(c.progresso, 0)} de {c.total} itens
                    </span>
                  </div>
                  <Progress value={c.progresso * 100} aria-label={`Checklist: ${fase}`} />
                </div>
              ) : (
                <p className="mb-4 text-xs text-muted-foreground">
                  O checklist aparece depois de confirmar o nível.
                </p>
              )}
              {marcos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem prazos nesta fase.</p>
              ) : (
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {marcos.map((m, i) => (
                    <li key={i} className="relative">
                      <span
                        aria-hidden
                        className={cn(
                          "absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-card",
                          m.origem === "Evento"
                            ? "bg-foreground"
                            : m.atrasado
                              ? "bg-danger"
                              : "bg-muted-foreground",
                        )}
                      />
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatarData(m.data)} · {m.origem}
                      </p>
                      <p className={cn("text-sm", m.origem === "Evento" && "font-semibold")}>
                        {m.titulo}
                      </p>
                      {(m.situacao || m.atrasado) && (
                        <p
                          className={cn(
                            "flex items-center gap-1 text-xs",
                            m.atrasado ? "text-danger-text" : "text-muted-foreground",
                          )}
                        >
                          {m.atrasado && <AlertTriangle className="size-3" />}
                          {[m.atrasado && m.situacao !== "Atrasada" ? "Atrasado" : null, m.situacao]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
