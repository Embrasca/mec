import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Carregando, Falha, formatarData, NivelBadge, PageHeader, Panel } from "@/components/kit";
import { Progress } from "@/components/ui/progress";
import { faseDoEvento, NOME_DO_PAPEL } from "@/domain/evento";
import { V3_16 } from "@/domain/metodologia/v3_16";
import { useEvento } from "@/lib/evento-atual";
import { acompanhamentoObter, fichaObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/")({
  component: VisaoGeral,
});

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function VisaoGeral() {
  const evento = useEvento();
  const ficha = useQuery({
    queryKey: ["ficha", evento.id],
    queryFn: () => fichaObter({ data: { eventoId: evento.id } }),
  });
  const acomp = useQuery({
    queryKey: ["acompanhamento", evento.id],
    queryFn: () => acompanhamentoObter({ data: { eventoId: evento.id } }),
  });
  const fase = faseDoEvento(hojeISO(), evento.dataInicio, evento.dataFim);
  const r = ficha.data?.resultado;
  const calculadoAcima =
    r?.nivelFinal != null && (evento.nivel === null || r.nivelFinal > evento.nivel);

  const passos = V3_16.roteiro.filter((p) => p.fase === fase || p.fase === "Todas as fases");

  return (
    <>
      <PageHeader
        eyebrow={`${fase} · ${formatarData(evento.dataInicio)} a ${formatarData(evento.dataFim)}`}
        title="Visão geral"
        description={
          evento.papel
            ? `Seu papel: ${NOME_DO_PAPEL[evento.papel]}.`
            : "Você acessa como administração da plataforma."
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Nível de exigência" className="lg:col-span-2">
          {ficha.isLoading && <Carregando />}
          {ficha.error && <Falha erro={ficha.error} />}
          {ficha.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <NivelBadge nivel={evento.nivel} longo />
                {evento.nivel !== null && r?.determinante && evento.nivel === r.nivelFinal && (
                  <span className="text-sm text-muted-foreground">
                    Determinado por: {r.determinante}
                  </span>
                )}
              </div>
              {ficha.data.versao === 0 && (
                <Aviso>
                  A ficha de caracterização ainda não foi preenchida. O nível aparece sozinho no fim
                  dela.
                </Aviso>
              )}
              {ficha.data.versao > 0 && r && r.pendencias.length > 0 && (
                <Aviso>Faltam dados na caracterização: {r.pendencias.join(" ")}</Aviso>
              )}
              {calculadoAcima && r.pendencias.length === 0 && (
                <Aviso>
                  A ficha indica <strong>Nível {r.nivelFinal}</strong>
                  {evento.nivel !== null && ` (o oficial é ${evento.nivel})`}. O gestor precisa
                  confirmar {evento.nivel === null ? "o enquadramento" : "o reenquadramento"}.
                </Aviso>
              )}
              <Link
                to="/e/$eventoId/caracterizacao"
                params={{ eventoId: evento.id }}
                className="inline-flex items-center gap-1 text-sm font-medium text-brand underline-offset-2 hover:underline"
              >
                Abrir caracterização <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </Panel>

        <Panel title="Requisitos do nível" hint="Aba B da Ferramenta">
          {acomp.isLoading && <Carregando />}
          {acomp.error && <Falha erro={acomp.error} />}
          {acomp.data &&
            (evento.nivel === null ? (
              <p className="text-sm text-muted-foreground">
                Disponível depois de confirmar o nível.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-2xl font-semibold">
                  {acomp.data.cumpridos}{" "}
                  <span className="text-base text-muted-foreground">de {acomp.data.total}</span>
                </p>
                <Progress
                  value={(acomp.data.cumpridos / acomp.data.total) * 100}
                  aria-label="Requisitos cumpridos"
                />
                <Link
                  to="/e/$eventoId/acompanhamento"
                  params={{ eventoId: evento.id }}
                  className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                >
                  Acompanhar <ArrowRight className="size-4" />
                </Link>
              </div>
            ))}
        </Panel>
      </div>

      <Panel
        title={`O caminho nesta fase (${fase})`}
        hint="Roteiro da Ferramenta MEC/GIZ. As demais etapas entram nas próximas versões do sistema."
      >
        <ol className="divide-y divide-border">
          {passos.map((p) => (
            <li
              key={p.aba}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm"
            >
              <CheckCircle2 className="size-4 shrink-0 self-center text-muted-foreground" />
              <span className="font-medium">{p.aba}</span>
              <span className="text-muted-foreground">{p.oQueFazer}</span>
              <span className="ml-auto text-xs text-muted-foreground">Guia: {p.noGuia}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
