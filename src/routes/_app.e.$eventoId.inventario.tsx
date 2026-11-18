/** Aba "2 - EX-ANTE" da Ferramenta: estimativa das emissões antes do evento. */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, formatarDataHora, PageHeader, Panel } from "@/components/kit";
import { SeloAlerta, TabelaEditavel, type Coluna } from "@/components/TabelaEditavel";
import { Button } from "@/components/ui/button";
import {
  calcularInventario,
  DESCRICOES_POR_CATEGORIA,
  itensDoFornecedor,
  orientacaoExAnte,
  TIPOS_DE_FORNECEDOR,
} from "@/domain/metodologia/inventario";
import { useEvento } from "@/lib/evento-atual";
import { numero, porcentagem } from "@/lib/formatar";
import {
  coletaLancar,
  inventarioFechar,
  inventarioObter,
  inventarioSalvar,
} from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/inventario")({
  head: () => ({ meta: [{ title: "Inventário ex-ante" }] }),
  component: InventarioExAnte,
});

interface Linha extends Record<string, unknown> {
  fornecedor: string | null;
  item: string | null;
  descricao: string | null;
  quantidade: number | null;
  premissa: string | null;
  origem: "manual" | "coleta";
}

const nova = (): Linha => ({
  fornecedor: null,
  item: null,
  descricao: null,
  quantidade: null,
  premissa: null,
  origem: "manual",
});

function InventarioExAnte() {
  const evento = useEvento();
  const qc = useQueryClient();
  const chave = ["inventario", evento.id, "ex_ante"];
  const inv = useQuery({
    queryKey: chave,
    queryFn: () => inventarioObter({ data: { eventoId: evento.id, etapa: "ex_ante" } }),
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [versao, setVersao] = useState(0);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    if (inv.data && !alterado) {
      setLinhas(inv.data.linhas.map(({ id: _id, ...l }) => l));
      setVersao(inv.data.versao);
    }
  }, [inv.data, alterado]);

  const base = inv.data?.baseCompleta;
  const r = useMemo(
    () => (base && inv.data ? calcularInventario(linhas, base, inv.data.ano, evento.nivel) : null),
    [linhas, base, inv.data, evento.nivel],
  );

  const aplicar = (d: NonNullable<typeof inv.data>) => {
    setLinhas(d.linhas.map(({ id: _id, ...l }) => l));
    setVersao(d.versao);
    setAlterado(false);
    qc.setQueryData(chave, d);
  };
  const salvar = useMutation({
    mutationFn: () =>
      inventarioSalvar({ data: { eventoId: evento.id, etapa: "ex_ante", versao, linhas } }),
    onSuccess: (d) => {
      aplicar(d);
      toast.success("Inventário salvo.");
    },
    onError: (e) => toast.error(e.message),
  });
  const lancar = useMutation({
    mutationFn: () => coletaLancar({ data: { eventoId: evento.id, etapa: "ex_ante" } }),
    onSuccess: async (x) => {
      setAlterado(false);
      await qc.invalidateQueries({ queryKey: chave });
      toast.success(`Coleta lançada: ${x.novas} linha(s) nova(s), ${x.atualizadas} atualizada(s).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const fechar = useMutation({
    mutationFn: () => inventarioFechar({ data: { eventoId: evento.id, etapa: "ex_ante", versao } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: chave });
      toast.success("Ex-ante fechado. Ele fica preservado para a comparação com o ex-post.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (inv.isLoading) return <Carregando />;
  if (inv.error || !inv.data || !r) return <Falha erro={inv.error} />;
  const fechado = Boolean(inv.data.fechadoEm);
  const somenteLeitura = !evento.podeEditar || fechado;

  const colunas: Coluna<Linha>[] = [
    {
      chave: "fornecedor",
      rotulo: "Fornecedor (filtra os itens)",
      tipo: "opcao",
      opcoes: TIPOS_DE_FORNECEDOR,
      largura: "8rem",
    },
    {
      chave: "item",
      rotulo: "Item",
      tipo: "opcao",
      opcoes: (l) => itensDoFornecedor(l.fornecedor),
      largura: "13rem",
    },
    {
      chave: "descricao",
      rotulo: "Descrição",
      tipo: "opcao",
      opcoes: (l) => {
        const cat = base?.itens.find((i) => i.item === l.item)?.categoria;
        return cat ? (DESCRICOES_POR_CATEGORIA[cat] ?? []) : [];
      },
      largura: "8rem",
    },
    { chave: "quantidade", rotulo: "Quantidade", tipo: "numero", largura: "6rem" },
    {
      chave: "premissa",
      rotulo: "Premissa / de onde veio o número",
      tipo: "texto",
      largura: "10rem",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Pré-evento · Aba 2 da Ferramenta"
        title="Inventário ex-ante"
        description="Quantidades PREVISTAS. Serve para descobrir onde reduzir; não é o resultado oficial."
        actions={
          !somenteLeitura && (
            <>
              <Button
                variant="outline"
                disabled={alterado || lancar.isPending}
                onClick={() => lancar.mutate()}
                title={alterado ? "Salve antes de lançar a coleta" : undefined}
              >
                Lançar a coleta
              </Button>
              <Button disabled={!alterado || salvar.isPending} onClick={() => salvar.mutate()}>
                {salvar.isPending
                  ? "Salvando…"
                  : alterado
                    ? "Salvar inventário"
                    : "Inventário salvo"}
              </Button>
            </>
          )
        }
      />
      <p className="rounded-lg bg-info-soft p-3 text-sm text-info-text">
        {orientacaoExAnte(evento.nivel)}
      </p>
      {fechado && (
        <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
          <Lock className="size-4" /> Fechado em {formatarDataHora(inv.data.fechadoEm!)} por{" "}
          {inv.data.fechadoPor}. Preserve o ex-ante original: a diferença para o ex-post é a
          informação de gestão mais valiosa.
        </p>
      )}
      {r.avisoSin && (
        <p className="flex items-center gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
          <AlertTriangle className="size-4 shrink-0" /> {r.avisoSin}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador rotulo="Total do evento" valor={`${numero(r.totais.total, 3)} tCO₂e`} destaque />
        <Indicador rotulo="Escopo 1" valor={numero(r.porEscopo[0], 3)} />
        <Indicador rotulo="Escopo 2" valor={numero(r.porEscopo[1], 3)} />
        <Indicador rotulo="Escopo 3" valor={numero(r.porEscopo[2], 3)} />
        <Indicador
          rotulo="CO₂ biogênico (fora do total)"
          valor={`${numero(r.totais.biogenico, 3)} t`}
        />
      </div>

      <Panel
        title="Linhas do inventário"
        hint={`Base de fatores: ${inv.data.base.nome} · GWP ${inv.data.base.referenciaGwp} · ano ${inv.data.ano}. ${
          r.pendencias > 0 ? `${r.pendencias} linha(s) com alerta.` : ""
        }`}
      >
        <TabelaEditavel<Linha>
          colunas={colunas}
          linhas={linhas}
          somenteLeitura={somenteLeitura}
          novaLinha={nova}
          onChange={(l) => {
            setLinhas(l);
            setAlterado(true);
          }}
          alterarLinha={(antes, depois) => {
            let l = depois;
            if (
              l.fornecedor !== antes.fornecedor &&
              l.item &&
              !itensDoFornecedor(l.fornecedor).includes(l.item)
            )
              l = { ...l, item: null, descricao: null };
            if (l.item !== antes.item) l = { ...l, descricao: null, origem: "manual" };
            if (l.quantidade !== antes.quantidade) l = { ...l, origem: "manual" };
            return l;
          }}
          calculadas={[
            {
              rotulo: "Unidade · escopo",
              valor: (i) => {
                const l = r.linhas[i];
                return l?.unidade ? (
                  <span className="text-xs text-muted-foreground">
                    {l.unidade} · E{l.escopo}
                  </span>
                ) : (
                  ""
                );
              },
            },
            { rotulo: "tCO₂e", alinhar: "direita", valor: (i) => numero(r.linhas[i]?.total, 4) },
            { rotulo: "Alerta", valor: (i) => <SeloAlerta texto={r.linhas[i]?.alerta} /> },
          ]}
        />
        {inv.data.atualizadoEm && (
          <p className="mt-3 text-xs text-muted-foreground">
            Última gravação: {formatarDataHora(inv.data.atualizadoEm)} por {inv.data.atualizadoPor}.
          </p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Total por categoria (tCO₂e)">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {r.porCategoria.map((c) => (
                <tr key={c.categoria}>
                  <td className="py-1.5">{c.categoria}</td>
                  <td className="py-1.5 text-right tabular-nums">{numero(c.total, 3)}</td>
                  <td className="w-20 py-1.5 text-right text-muted-foreground tabular-nums">
                    {porcentagem(c.participacao)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Os detalhes de cada fator (fonte e situação) estão em{" "}
            {evento.baseFatoresId ? (
              <Link
                to="/fatores/$baseId"
                params={{ baseId: evento.baseFatoresId }}
                className="underline"
              >
                Base de fatores
              </Link>
            ) : (
              "Base de fatores"
            )}
            .
          </p>
        </Panel>
        <Panel
          title="Fechamento do ex-ante"
          hint="Fechado, o ex-ante não muda mais e a base de fatores do evento fica travada."
        >
          {fechado ? (
            <p className="text-sm text-muted-foreground">Ex-ante fechado.</p>
          ) : evento.podeGerir ? (
            <div className="space-y-2">
              {(alterado || r.pendencias > 0 || linhas.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  {alterado
                    ? "Salve antes de fechar."
                    : r.pendencias > 0
                      ? "Resolva os alertas antes de fechar."
                      : "O inventário está vazio."}
                </p>
              )}
              <Button
                variant="outline"
                disabled={alterado || r.pendencias > 0 || linhas.length === 0 || fechar.isPending}
                onClick={() =>
                  window.confirm(
                    "Fechar o ex-ante? Depois disso ele não pode mais ser alterado.",
                  ) && fechar.mutate()
                }
              >
                Fechar ex-ante
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Apenas o gestor do evento fecha o ex-ante.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

function Indicador({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{rotulo}</p>
      <p
        className={
          destaque
            ? "mt-1 text-2xl font-semibold tabular-nums"
            : "mt-1 text-lg font-semibold tabular-nums"
        }
      >
        {valor}
      </p>
    </div>
  );
}
