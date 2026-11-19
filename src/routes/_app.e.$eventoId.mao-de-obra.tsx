/** Mão de obra local (ML1 a ML7): quem trabalhou no evento, quanto é da região e em que condições. */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Anexos, CartoesDeIndicadores, useAtualizarEsg, useEsg } from "@/components/esg";
import { FormularioDeCampos, type Campo } from "@/components/FormularioDeCampos";
import { Carregando, Falha, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  equipeSchema,
  equipeVazia,
  FASES_DE_TRABALHO,
  horasDaEquipe,
  MODOS_DE_HORAS,
  VINCULOS,
  type Equipe,
} from "@/domain/esg/esquemas";
import { useEvento } from "@/lib/evento-atual";
import { numero } from "@/lib/formatar";
import { esgRemoverItem, esgSalvarItem } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/mao-de-obra")({
  head: () => ({ meta: [{ title: "Mão de obra local" }] }),
  component: MaoDeObra,
});

const CAMPOS: Campo<Equipe>[] = [
  { chave: "nome", rotulo: "Equipe ou fornecedor", tipo: "texto", max: 200, largo: true },
  { chave: "vinculo", rotulo: "Vínculo", tipo: "opcao", opcoes: VINCULOS, vazio: false },
  { chave: "fase", rotulo: "Fase", tipo: "opcao", opcoes: FASES_DE_TRABALHO, vazio: false },
  { chave: "pessoas", rotulo: "Pessoas", tipo: "inteiro" },
  {
    chave: "pessoasLocais",
    rotulo: "Pessoas que moram na área local",
    tipo: "inteiro",
    ajuda: "Pela declaração do fornecedor ou da equipe.",
  },
  {
    chave: "modoHoras",
    rotulo: "Como informar as horas",
    tipo: "opcao",
    opcoes: MODOS_DE_HORAS,
    largo: true,
  },
  { chave: "horasPorPessoa", rotulo: "Horas por pessoa (média)", tipo: "numero" },
  { chave: "horasTotais", rotulo: "Total de horas da escala", tipo: "numero" },
  { chave: "horasLocais", rotulo: "Horas de pessoas locais (escala)", tipo: "numero" },
  { chave: "formalizadas", rotulo: "Com vínculo formal (CLT, contrato, MEI)", tipo: "inteiro" },
  { chave: "mulheres", rotulo: "Mulheres", tipo: "inteiro", ajuda: "Totais autodeclarados." },
  { chave: "negras", rotulo: "Pessoas negras", tipo: "inteiro" },
  { chave: "pcd", rotulo: "Pessoas com deficiência", tipo: "inteiro" },
  { chave: "jovens", rotulo: "Jovens até 24 anos", tipo: "inteiro" },
  { chave: "capacitadas", rotulo: "Pessoas capacitadas", tipo: "inteiro" },
  { chave: "horasCapacitacao", rotulo: "Horas de capacitação (total)", tipo: "numero" },
  { chave: "acidentesComAfastamento", rotulo: "Acidentes com afastamento", tipo: "inteiro" },
  { chave: "acidentesSemAfastamento", rotulo: "Acidentes sem afastamento", tipo: "inteiro" },
  { chave: "evidencia", rotulo: "Referência da evidência", tipo: "texto", largo: true },
];

function MaoDeObra() {
  const evento = useEvento();
  const esg = useEsg();
  const atualizar = useAtualizarEsg();
  const [editando, setEditando] = useState<{ id: string | null; dados: Equipe } | null>(null);
  const remover = useMutation({
    mutationFn: (id: string) =>
      esgRemoverItem({ data: { eventoId: evento.id, lista: "equipe", id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });
  if (esg.isLoading) return <Carregando />;
  if (!esg.data) return <Falha erro={esg.error} />;
  const { equipes, indicadores, area } = esg.data;

  return (
    <>
      <PageHeader
        eyebrow="ESG · Mão de obra local"
        title="Mão de obra local"
        description="Quem trabalhou no evento, quanto disso é gente da região e em que condições. Uma linha por equipe ou fornecedor de mão de obra em cada fase; diversidade só em totais autodeclarados."
        actions={
          evento.podeEditar && (
            <Button onClick={() => setEditando({ id: null, dados: equipeVazia() })}>
              <Plus className="size-4" /> Equipe
            </Button>
          )
        }
      />
      <p className="rounded-lg bg-info-soft p-3 text-sm text-info-text">
        Área local do evento: {area.descricao}
      </p>
      <Panel title="Equipes">
        {equipes.length === 0 ? (
          <Vazio>Nenhuma equipe registrada.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Equipe</th>
                  <th className="py-2 pr-3 font-medium">Vínculo · fase</th>
                  <th className="py-2 pr-3 text-right font-medium">Pessoas</th>
                  <th className="py-2 pr-3 text-right font-medium">Locais</th>
                  <th className="py-2 pr-3 text-right font-medium">Horas</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {equipes.map((e) => {
                  const h = horasDaEquipe(e);
                  return (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 font-medium">{e.nome}</td>
                      <td className="py-2 pr-3">
                        {e.vinculo} · {e.fase}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.pessoas}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {e.pessoasLocais ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{numero(h.total, 0)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const { id, ...dados } = e;
                            setEditando({ id, dados });
                          }}
                        >
                          {evento.podeEditar ? "Editar" : "Ver"}
                        </Button>
                        {evento.podeEditar && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              window.confirm(`Remover “${e.nome}”?`) && remover.mutate(e.id)
                            }
                          >
                            Remover
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <CartoesDeIndicadores indicadores={indicadores.filter((i) => i.eixo === "ml")} />
      {editando && (
        <FormularioDeCampos<Equipe>
          titulo={editando.id ? "Equipe" : "Nova equipe"}
          campos={CAMPOS}
          inicial={editando.dados}
          schema={equipeSchema}
          somenteLeitura={!evento.podeEditar}
          fechar={() => setEditando(null)}
          salvar={async (dados) => {
            await esgSalvarItem({
              data: { eventoId: evento.id, lista: "equipe", id: editando.id, dados },
            });
            await atualizar();
            toast.success("Equipe salva.");
          }}
          rodape={
            editando.id ? (
              <Anexos entidade="equipe" entidadeId={editando.id} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Salve a equipe para anexar evidências.
              </p>
            )
          }
        />
      )}
    </>
  );
}
