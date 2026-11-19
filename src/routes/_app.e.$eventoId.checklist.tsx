/** Aba "C - CHECKLIST" da Ferramenta: listas de verificação do nível, fase por fase. */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { Progress } from "@/components/ui/progress";
import { situacaoDaFase, type ItemVisivel, type Resposta } from "@/domain/metodologia/checklist";
import { useEvento } from "@/lib/evento-atual";
import { porcentagem } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { checklistMarcar, checklistObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/checklist")({
  head: () => ({ meta: [{ title: "Checklist do nível" }] }),
  component: Checklist,
});

function Checklist() {
  const evento = useEvento();
  const dados = useQuery({
    queryKey: ["checklist", evento.id],
    queryFn: () => checklistObter({ data: { eventoId: evento.id } }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Todas as fases · Aba C da Ferramenta"
        title="Checklist do nível"
        description={
          evento.nivel
            ? `Nível ${evento.nivel}: a lista mostra exatamente o que este nível exige, fase por fase. Itens marcados como NOVO começam neste nível; os demais vêm dos níveis anteriores.`
            : "A lista aparece quando o nível do evento for confirmado."
        }
      />
      {dados.isLoading && <Carregando />}
      {dados.error && <Falha erro={dados.error} />}
      {dados.data && evento.nivel === null && (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Confirme o nível em{" "}
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
      {dados.data?.fases
        .filter((f) => f.itens.length > 0)
        .map((f) => (
          <Panel
            key={f.codigo}
            title={`${f.nome} — ${f.itens.length} itens`}
            actions={
              <div className="flex items-center gap-3">
                <Progress
                  className="w-40"
                  value={f.progresso * 100}
                  aria-label={`Progresso: ${f.nome}`}
                />
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    f.concluida
                      ? "bg-success-soft text-success-text"
                      : "bg-warning-soft text-warning-text",
                  )}
                >
                  {porcentagem(f.progresso, 0)} · {situacaoDaFase(f)}
                </span>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 py-2 pr-2 font-medium">Nº</th>
                    <th className="py-2 pr-3 font-medium">O que fazer, exatamente</th>
                    <th className="py-2 pr-3 font-medium">Quando</th>
                    <th className="py-2 pr-3 font-medium">Quem faz</th>
                    <th className="py-2 pr-3 font-medium">O que fica registrado</th>
                    <th className="py-2 pr-3 font-medium">Feito?</th>
                    <th className="py-2 font-medium">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {f.itens.map((i) => (
                    <Linha key={i.chave} item={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
    </>
  );
}

function Linha({ item }: { item: ItemVisivel }) {
  const evento = useEvento();
  const qc = useQueryClient();
  const [obs, setObs] = useState(item.observacao ?? "");
  const pode = evento.podeEditar;
  const marcar = useMutation({
    mutationFn: (v: { feito: Resposta; observacao: string | null }) =>
      checklistMarcar({ data: { eventoId: evento.id, chave: item.chave, ...v } }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["checklist", evento.id] }),
        qc.invalidateQueries({ queryKey: ["linha-do-tempo", evento.id] }),
      ]),
    onError: (e) => toast.error(e.message),
  });
  return (
    <tr
      className={cn(
        "border-t border-border align-top",
        item.feito === "Sim" && "text-muted-foreground",
      )}
    >
      <td className="py-2 pr-2 tabular-nums">{item.ordem}</td>
      <td className="py-2 pr-3 text-foreground">
        {item.oQueFazer}
        {item.novo && (
          <span className="ml-2 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-text">
            NOVO
          </span>
        )}
      </td>
      <td className="py-2 pr-3">{item.quando}</td>
      <td className="py-2 pr-3">{item.quemFaz}</td>
      <td className="py-2 pr-3">{item.registro}</td>
      <td className="py-2 pr-3">
        <select
          aria-label={`Item ${item.ordem}: feito?`}
          disabled={!pode || marcar.isPending}
          value={item.feito ?? ""}
          onChange={(e) =>
            e.target.value &&
            marcar.mutate({ feito: e.target.value as Resposta, observacao: obs.trim() || null })
          }
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        >
          <option value="">—</option>
          <option>Sim</option>
          <option>Não</option>
        </select>
      </td>
      <td className="py-2">
        <input
          aria-label={`Item ${item.ordem}: observação`}
          disabled={!pode || !item.feito}
          value={obs}
          maxLength={2000}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() =>
            item.feito &&
            obs !== (item.observacao ?? "") &&
            marcar.mutate({ feito: item.feito, observacao: obs.trim() || null })
          }
          className="h-8 w-full min-w-40 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        />
      </td>
    </tr>
  );
}
