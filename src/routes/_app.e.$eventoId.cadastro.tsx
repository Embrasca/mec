import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/kit";
import { FormularioDoEvento } from "@/components/FormularioDoEvento";
import { Button } from "@/components/ui/button";
import { useEvento } from "@/lib/evento-atual";
import { useSessao } from "@/lib/sessao";
import {
  basesListar,
  eventoArquivar,
  eventoAtualizar,
  eventoDefinirBase,
} from "@/api/api.functions";

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
            municipioIbge: evento.municipioIbge,
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
      <BaseDoEvento />
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

function BaseDoEvento() {
  const evento = useEvento();
  const qc = useQueryClient();
  const bases = useQuery({ queryKey: ["bases"], queryFn: () => basesListar() });
  const [escolhida, setEscolhida] = useState(evento.baseFatoresId ?? "");
  const definir = useMutation({
    mutationFn: () => eventoDefinirBase({ data: { eventoId: evento.id, baseId: escolhida } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["evento", evento.id] });
      await qc.invalidateQueries({ queryKey: ["inventario", evento.id] });
      toast.success("Base de fatores do evento alterada.");
    },
    onError: (e) => toast.error(e.message),
  });
  const publicadas = bases.data?.filter((b) => b.situacao === "publicada") ?? [];
  return (
    <Panel
      title="Base de fatores"
      hint="Os valores de GWP precisam ser os mesmos da base de fatores. A troca só acontece entre edições, nunca no meio de um evento: depois de fechar o ex-ante, a base fica travada."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="base-evento" className="text-sm font-medium">
            Base usada pelo evento
          </label>
          <select
            id="base-evento"
            disabled={!evento.podeGerir}
            value={escolhida}
            onChange={(e) => setEscolhida(e.target.value)}
            className="h-9 w-80 max-w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {!evento.baseFatoresId && <option value="">Escolha…</option>}
            {publicadas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        {evento.podeGerir && (
          <Button
            variant="outline"
            disabled={!escolhida || escolhida === evento.baseFatoresId || definir.isPending}
            onClick={() => definir.mutate()}
          >
            Usar esta base
          </Button>
        )}
        {evento.baseFatoresId && (
          <Link
            to="/fatores/$baseId"
            params={{ baseId: evento.baseFatoresId }}
            className="text-sm text-brand underline"
          >
            Ver fatores
          </Link>
        )}
      </div>
    </Panel>
  );
}
