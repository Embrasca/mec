/** Aba B da Ferramenta: o que o nível exige e o que já foi feito. */
import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { Progress } from "@/components/ui/progress";
import { V3_16 } from "@/domain/metodologia/v3_16";
import { useEvento } from "@/lib/evento-atual";
import { cn } from "@/lib/utils";
import { acompanhamentoObter, requisitoMarcar } from "@/api/api.functions";
import type { LinhaDeAcompanhamento } from "@/servidor/servicos/governanca.server";

export const Route = createFileRoute("/_app/e/$eventoId/acompanhamento")({
  head: () => ({ meta: [{ title: "Requisitos do nível" }] }),
  component: Acompanhamento,
});

function Acompanhamento() {
  const evento = useEvento();
  const dados = useQuery({
    queryKey: ["acompanhamento", evento.id],
    queryFn: () => acompanhamentoObter({ data: { eventoId: evento.id } }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Governança · Aba B da Ferramenta"
        title="Requisitos do nível"
        description="A coluna destacada mostra o que se aplica ao nível oficial do evento. Marque o que já foi feito."
      />
      {dados.isLoading && <Carregando />}
      {dados.error && <Falha erro={dados.error} />}
      {dados.data && evento.nivel === null && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            O acompanhamento começa depois que o gestor confirma o nível em{" "}
            <Link
              to="/e/$eventoId/caracterizacao"
              params={{ eventoId: evento.id }}
              className="text-brand underline"
            >
              Caracterização e nível
            </Link>
            .
          </p>
        </Panel>
      )}
      {dados.data && (
        <Panel
          title={`Requisitos cumpridos: ${dados.data.cumpridos} de ${dados.data.total}`}
          actions={
            <Progress
              className="w-48"
              value={(dados.data.cumpridos / dados.data.total) * 100}
              aria-label="Progresso"
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Requisito</th>
                  {V3_16.designacoes.map((d, i) => (
                    <th
                      key={d}
                      className={cn(
                        "py-2 pr-3 font-medium",
                        evento.nivel === i + 1 && "text-foreground",
                      )}
                    >
                      Nível {i + 1}
                    </th>
                  ))}
                  <th className="py-2 pr-3 font-medium">Já foi feito?</th>
                  <th className="py-2 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {agrupar(dados.data.linhas).map(([fase, linhas]) => (
                  <Fragment key={fase}>
                    <tr>
                      <th colSpan={7} className="eyebrow bg-muted/60 px-2 py-1.5 text-left">
                        {fase}
                      </th>
                    </tr>
                    {linhas.map((l) => (
                      <Linha key={l.requisito} linha={l} />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function agrupar(linhas: LinhaDeAcompanhamento[]) {
  const m = new Map<string, LinhaDeAcompanhamento[]>();
  for (const l of linhas) m.set(l.fase, [...(m.get(l.fase) ?? []), l]);
  return [...m.entries()];
}

function Linha({ linha }: { linha: LinhaDeAcompanhamento }) {
  const evento = useEvento();
  const qc = useQueryClient();
  const [obs, setObs] = useState(linha.observacao ?? "");
  const pode = evento.podeEditar && evento.nivel !== null;
  const marcar = useMutation({
    mutationFn: (v: { feito: "Sim" | "Não"; observacao: string | null }) =>
      requisitoMarcar({ data: { eventoId: evento.id, requisito: linha.requisito, ...v } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["acompanhamento", evento.id] }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 font-medium">{linha.requisito}</td>
      {linha.porNivel.map((texto, i) => (
        <td
          key={i}
          className={cn(
            "py-2 pr-3 text-xs",
            evento.nivel === i + 1
              ? "bg-highlight-bg font-medium text-foreground"
              : "text-muted-foreground",
          )}
        >
          {texto}
        </td>
      ))}
      <td className="py-2 pr-3">
        <select
          aria-label={`${linha.requisito}: já foi feito?`}
          disabled={!pode || marcar.isPending}
          value={linha.feito ?? ""}
          onChange={(e) =>
            e.target.value &&
            marcar.mutate({
              feito: e.target.value as "Sim" | "Não",
              observacao: obs.trim() || null,
            })
          }
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">—</option>
          <option>Sim</option>
          <option>Não</option>
        </select>
      </td>
      <td className="py-2">
        <input
          aria-label={`${linha.requisito}: observação`}
          disabled={!pode || !linha.feito}
          value={obs}
          maxLength={2000}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() =>
            linha.feito &&
            obs !== (linha.observacao ?? "") &&
            marcar.mutate({ feito: linha.feito, observacao: obs.trim() || null })
          }
          className="h-8 w-full min-w-40 rounded-md border border-input bg-transparent px-2 text-sm"
        />
        {linha.atualizadoPor && (
          <span className="text-[11px] text-muted-foreground">por {linha.atualizadoPor}</span>
        )}
      </td>
    </tr>
  );
}
