import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import type { FatorDoItem } from "@/domain/metodologia/inventario";
import { useSessao } from "@/lib/sessao";
import { numero } from "@/lib/formatar";
import {
  baseExcluirRascunho,
  baseObter,
  basePublicar,
  fatorAlterar,
  fatorSinDefinir,
} from "@/api/api.functions";

export const Route = createFileRoute("/_app/fatores/$baseId")({
  head: () => ({ meta: [{ title: "Base de fatores" }] }),
  component: Base,
});

function Base() {
  const { baseId } = Route.useParams();
  const { perfil } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const base = useQuery({
    queryKey: ["base", baseId],
    queryFn: () => baseObter({ data: { id: baseId } }),
  });
  const atualizar = () => qc.invalidateQueries({ queryKey: ["base", baseId] });
  const publicar = useMutation({
    mutationFn: () => basePublicar({ data: { id: baseId } }),
    onSuccess: async () => {
      await Promise.all([atualizar(), qc.invalidateQueries({ queryKey: ["bases"] })]);
      toast.success("Base publicada. A partir de agora ela não muda.");
    },
    onError: (e) => toast.error(e.message),
  });
  const excluir = useMutation({
    mutationFn: () => baseExcluirRascunho({ data: { id: baseId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bases"] });
      void navegar({ to: "/fatores" });
    },
    onError: (e) => toast.error(e.message),
  });

  if (base.isLoading)
    return (
      <Shell>
        <Carregando />
      </Shell>
    );
  if (!base.data)
    return (
      <Shell>
        <Falha erro={base.error} />
      </Shell>
    );
  const b = base.data;
  const editavel = Boolean(perfil?.adminPlataforma) && b.situacao === "rascunho";

  return (
    <Shell>
      <PageHeader
        eyebrow={b.situacao === "publicada" ? "Base publicada" : "Rascunho"}
        title={b.nome}
        description={`${b.observacao ?? ""} GWP: ${b.referenciaGwp} (CH₄ ${b.gwpCh4}; N₂O ${b.gwpN2o}).`}
        actions={
          editavel && (
            <>
              <Button
                variant="outline"
                disabled={excluir.isPending}
                onClick={() => window.confirm("Excluir este rascunho?") && excluir.mutate()}
              >
                Excluir rascunho
              </Button>
              <Button
                disabled={publicar.isPending}
                onClick={() =>
                  window.confirm(
                    "Publicar? Depois de publicada, a base não pode mais ser alterada.",
                  ) && publicar.mutate()
                }
              >
                Publicar
              </Button>
            </>
          )
        }
      />
      <p className="text-sm">
        <Link to="/fatores" className="text-brand underline">
          Todas as versões
        </Link>
      </p>
      <Panel
        title="Fatores por item"
        hint="kg por unidade. CO₂ biogênico é informado à parte e não entra no total."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2 font-medium">Código</th>
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="py-2 pr-2 font-medium">Escopo</th>
                <th className="py-2 pr-2 text-right font-medium">FE CO₂</th>
                <th className="py-2 pr-2 text-right font-medium">FE CH₄</th>
                <th className="py-2 pr-2 text-right font-medium">FE N₂O</th>
                <th className="py-2 pr-2 text-right font-medium">CO₂ biogênico</th>
                <th className="py-2 pr-2 font-medium">Fonte</th>
                {editavel && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {b.itens.map((f) => (
                <LinhaDoFator
                  key={f.item}
                  baseId={baseId}
                  fator={f}
                  editavel={editavel}
                  salvo={atualizar}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <FatorSin baseId={baseId} sin={b.sin} editavel={editavel} salvo={atualizar} />
    </Shell>
  );
}

const celula =
  "h-8 w-28 rounded-md border border-input bg-transparent px-2 text-right text-sm tabular-nums";

function LinhaDoFator({
  baseId,
  fator,
  editavel,
  salvo,
}: {
  baseId: string;
  fator: FatorDoItem;
  editavel: boolean;
  salvo: () => Promise<unknown>;
}) {
  const [v, setV] = useState({
    feCo2: fator.feCo2,
    feCh4: fator.feCh4,
    feN2o: fator.feN2o,
    feBiogenico: fator.feBiogenico,
    fonte: fator.fonte,
  });
  const alterado =
    v.feCo2 !== fator.feCo2 ||
    v.feCh4 !== fator.feCh4 ||
    v.feN2o !== fator.feN2o ||
    v.feBiogenico !== fator.feBiogenico ||
    v.fonte !== fator.fonte;
  const salvar = useMutation({
    mutationFn: () =>
      fatorAlterar({ data: { baseId, item: fator.item, ...v, situacao: fator.situacao } }),
    onSuccess: async () => {
      await salvo();
      toast.success("Fator salvo.");
    },
    onError: (e) => toast.error(e.message),
  });
  const sin = fator.regra.tipo === "sin";
  const num = (k: "feCo2" | "feCh4" | "feN2o" | "feBiogenico") =>
    editavel && !(sin && k === "feCo2") ? (
      <input
        aria-label={`${k} de ${fator.item}`}
        type="number"
        step="any"
        min={0}
        className={celula}
        value={v[k] ?? ""}
        onChange={(e) =>
          setV((x) => ({ ...x, [k]: e.target.value === "" ? 0 : Number(e.target.value) }))
        }
      />
    ) : sin && k === "feCo2" ? (
      <span className="text-xs text-muted-foreground">
        {fator.regra.multiplicador === 1 ? "SIN do ano" : `${fator.regra.multiplicador} × SIN`}
      </span>
    ) : (
      numero(fator[k], 10)
    );
  return (
    <tr className="align-top">
      <td className="py-2 pr-2 text-xs text-muted-foreground">{fator.codigo}</td>
      <td className="py-2 pr-2">
        <span className="font-medium">{fator.item}</span>
        <span className="block text-xs text-muted-foreground">
          {fator.categoria} · {fator.situacao}
        </span>
      </td>
      <td className="py-2 pr-2">{fator.escopo}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{num("feCo2")}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{num("feCh4")}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{num("feN2o")}</td>
      <td className="py-2 pr-2 text-right tabular-nums">{num("feBiogenico")}</td>
      <td className="max-w-md py-2 pr-2 text-xs text-muted-foreground">
        {editavel ? (
          <textarea
            aria-label={`Fonte de ${fator.item}`}
            className="w-full rounded-md border border-input bg-transparent p-1.5 text-xs"
            rows={2}
            value={v.fonte}
            onChange={(e) => setV((x) => ({ ...x, fonte: e.target.value }))}
          />
        ) : (
          fator.fonte
        )}
      </td>
      {editavel && (
        <td className="py-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!alterado || salvar.isPending}
            onClick={() => salvar.mutate()}
          >
            Salvar
          </Button>
        </td>
      )}
    </tr>
  );
}

function FatorSin({
  baseId,
  sin,
  editavel,
  salvo,
}: {
  baseId: string;
  sin: { ano: number; valor: number }[];
  editavel: boolean;
  salvo: () => Promise<unknown>;
}) {
  const [ano, setAno] = useState("");
  const [valor, setValor] = useState("");
  const definir = useMutation({
    mutationFn: () => fatorSinDefinir({ data: { baseId, ano: Number(ano), valor: Number(valor) } }),
    onSuccess: async () => {
      setAno("");
      setValor("");
      await salvo();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Panel
      title="Fator do SIN por ano (tCO₂/MWh = kgCO₂/kWh)"
      hint="Média anual do Sistema Interligado Nacional. Sem fator para o ano do evento, o cálculo usa o último ano disponível e avisa."
    >
      <div className="flex flex-wrap gap-2">
        {sin.map((s) => (
          <span
            key={s.ano}
            className="rounded-md border border-border px-2.5 py-1 text-sm tabular-nums"
          >
            {s.ano}: {numero(s.valor, 7)}
          </span>
        ))}
      </div>
      {editavel && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <input
            aria-label="Ano"
            type="number"
            placeholder="Ano"
            className={celula}
            value={ano}
            onChange={(e) => setAno(e.target.value)}
          />
          <input
            aria-label="Valor"
            type="number"
            step="any"
            placeholder="Valor"
            className={celula}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!ano || !valor || definir.isPending}
            onClick={() => definir.mutate()}
          >
            Definir ano
          </Button>
        </div>
      )}
    </Panel>
  );
}
