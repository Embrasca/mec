import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/kit";
import { FormularioDoEvento } from "@/components/FormularioDoEvento";
import { Button } from "@/components/ui/button";
import { useEvento } from "@/lib/evento-atual";
import { useSessao } from "@/lib/sessao";
import { eventoArquivar, eventoAtualizar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro do evento" }] }),
  component: Cadastro,
});

function Cadastro() {
  const evento = useEvento();
  const { perfil } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const salvar = useMutation({ mutationFn: eventoAtualizar });
  const arquivar = useMutation({
    mutationFn: (v: boolean) => eventoArquivar({ data: { id: evento.id, arquivar: v } }),
    onSuccess: async (_r, v) => {
      await qc.invalidateQueries({ queryKey: ["eventos"] });
      toast.success(v ? "Evento arquivado." : "Evento reaberto.");
      if (v) void navegar({ to: "/eventos" });
      else await qc.invalidateQueries({ queryKey: ["evento", evento.id] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Evento"
        title="Cadastro do evento"
        description="Dados de identificação usados em todo o sistema. Mudar as datas pode mudar o nível calculado."
      />
      <Panel>
        <FormularioDoEvento
          key={evento.id}
          somenteLeitura={!evento.podeGerir}
          inicial={{
            nome: evento.nome,
            instituicao: evento.instituicao,
            cidade: evento.cidade,
            uf: evento.uf as never,
            dataInicio: evento.dataInicio,
            dataFim: evento.dataFim,
            cor: evento.cor,
            descricao: evento.descricao,
          }}
          rotuloEnviar="Salvar cadastro"
          enviar={async (dados) => {
            try {
              await salvar.mutateAsync({ data: { id: evento.id, dados } });
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["evento", evento.id] }),
                qc.invalidateQueries({ queryKey: ["eventos"] }),
                qc.invalidateQueries({ queryKey: ["ficha", evento.id] }),
              ]);
              toast.success("Cadastro salvo.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
            }
          }}
        />
      </Panel>
      {perfil?.adminPlataforma && (
        <Panel title="Arquivamento" hint="Evento arquivado sai do portfólio, mas nada é apagado.">
          <Button
            variant="outline"
            disabled={arquivar.isPending}
            onClick={() =>
              window.confirm(evento.arquivado ? "Reabrir o evento?" : "Arquivar o evento?") &&
              arquivar.mutate(!evento.arquivado)
            }
          >
            {evento.arquivado ? "Reabrir evento" : "Arquivar evento"}
          </Button>
        </Panel>
      )}
    </>
  );
}
