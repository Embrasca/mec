/** Abas "2 - EX-ANTE" e "3 - EX-POST" da Ferramenta: linhas, totais e fechamento do inventário. */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
  orientacaoExPost,
  QUALIDADES,
  rotuloDaQualidade,
  TIPOS_DE_FORNECEDOR,
  type Etapa,
  type LinhaDeInventario,
} from "@/domain/metodologia/inventario";
import { useEvento } from "@/lib/evento-atual";
import { numero, porcentagem } from "@/lib/formatar";
import {
  coletaLancar,
  inventarioFechar,
  inventarioObter,
  inventarioSalvar,
  ocorrenciasListar,
} from "@/api/api.functions";

interface Linha extends Record<string, unknown> {
  fornecedor: string | null;
  item: string | null;
  descricao: string | null;
  quantidade: number | null;
  premissa: string | null;
  /** Rótulo da lista (ex.: "4 - Documento do fornecedor"); a nota vai para o servidor. */
  qualidade: string | null;
  evidencia: string | null;
  origem: "manual" | "coleta";
}

const nova = (): Linha => ({
  fornecedor: null,
  item: null,
  descricao: null,
  quantidade: null,
  premissa: null,
  qualidade: null,
  evidencia: null,
  origem: "manual",
});

const nota = (rotulo: string | null) => (rotulo ? Number(rotulo.slice(0, 1)) : null);
const paraTela = (l: LinhaDeInventario & { origem: "manual" | "coleta" }): Linha => ({
  fornecedor: l.fornecedor,
  item: l.item,
  descricao: l.descricao,
  quantidade: l.quantidade,
  premissa: l.premissa,
  qualidade: rotuloDaQualidade(l.qualidade),
  evidencia: l.evidencia ?? null,
  origem: l.origem,
});
const paraServidor = (l: Linha) => ({ ...l, qualidade: nota(l.qualidade) });

const TEXTOS = {
  ex_ante: {
    eyebrow: "Pré-evento · Aba 2 da Ferramenta",
    titulo: "Inventário ex-ante",
    descricao:
      "Quantidades PREVISTAS. Serve para descobrir onde reduzir; não é o resultado oficial.",
    nome: "ex-ante",
    fechado:
      "Preserve o ex-ante original: a diferença para o ex-post é a informação de gestão mais valiosa.",
    aoFechar: "Ex-ante fechado. Ele fica preservado para a comparação com o ex-post.",
  },
  ex_post: {
    eyebrow: "Execução e pós-evento · Aba 3 da Ferramenta",
    titulo: "Inventário ex-post",
    descricao:
      "Quantidades REAIS, com qualidade do dado e evidência. Este é o inventário oficial do evento.",
    nome: "ex-post",
    fechado: "Este é o resultado oficial do evento.",
    aoFechar: "Ex-post fechado. Os resultados do evento estão consolidados.",
  },
} as const;

export function TelaDoInventario({ etapa }: { etapa: Etapa }) {
  const t = TEXTOS[etapa];
  const posEvento = etapa === "ex_post";
  const evento = useEvento();
  const qc = useQueryClient();
  const chave = ["inventario", evento.id, etapa];
  const ocorrencias = useQuery({
    queryKey: ["ocorrencias", evento.id],
    queryFn: () => ocorrenciasListar({ data: { eventoId: evento.id } }),
    enabled: posEvento,
  });
  const abertas = posEvento ? (ocorrencias.data?.resumo.abertas ?? 0) : 0;
  const inv = useQuery({
    queryKey: chave,
    queryFn: () => inventarioObter({ data: { eventoId: evento.id, etapa } }),
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [versao, setVersao] = useState(0);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    if (inv.data && !alterado) {
      setLinhas(inv.data.linhas.map(paraTela));
      setVersao(inv.data.versao);
    }
  }, [inv.data, alterado]);

  const base = inv.data?.baseCompleta;
  const r = useMemo(
    () =>
      base && inv.data
        ? calcularInventario(linhas.map(paraServidor), base, inv.data.ano, evento.nivel, etapa)
        : null,
    [linhas, base, inv.data, evento.nivel, etapa],
  );

  const aplicar = (d: NonNullable<typeof inv.data>) => {
    setLinhas(d.linhas.map(paraTela));
    setVersao(d.versao);
    setAlterado(false);
    qc.setQueryData(chave, d);
  };
  const salvar = useMutation({
    mutationFn: () =>
      inventarioSalvar({
        data: { eventoId: evento.id, etapa, versao, linhas: linhas.map(paraServidor) },
      }),
    onSuccess: (d) => {
      aplicar(d);
      toast.success("Inventário salvo.");
    },
    onError: (e) => toast.error(e.message),
  });
  const lancar = useMutation({
    mutationFn: () => coletaLancar({ data: { eventoId: evento.id, etapa } }),
    onSuccess: async (x) => {
      setAlterado(false);
      await qc.invalidateQueries({ queryKey: chave });
      toast.success(`Coleta lançada: ${x.novas} linha(s) nova(s), ${x.atualizadas} atualizada(s).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const fechar = useMutation({
    mutationFn: () => inventarioFechar({ data: { eventoId: evento.id, etapa, versao } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: chave });
      await qc.invalidateQueries({ queryKey: ["pos-evento", evento.id] });
      toast.success(t.aoFechar);
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
    ...(posEvento
      ? ([
          {
            chave: "qualidade",
            rotulo: "Qualidade do dado",
            tipo: "opcao",
            opcoes: QUALIDADES,
            largura: "9rem",
          },
          {
            chave: "evidencia",
            rotulo:
              evento.nivel === 1 ? "Evidência (opcional neste nível)" : "Evidência (obrigatória)",
            tipo: "texto",
            largura: "8rem",
          },
        ] satisfies Coluna<Linha>[])
      : []),
    {
      chave: "premissa",
      rotulo: posEvento ? "Premissa / observação" : "Premissa / de onde veio o número",
      tipo: "texto",
      largura: "10rem",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.titulo}
        description={t.descricao}
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
        {posEvento ? orientacaoExPost(evento.nivel) : orientacaoExAnte(evento.nivel)}
      </p>
      {fechado && (
        <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
          <Lock className="size-4" /> Fechado em {formatarDataHora(inv.data.fechadoEm!)} por{" "}
          {inv.data.fechadoPor}. {t.fechado}
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
          title={`Fechamento do ${t.nome}`}
          hint={`Fechado, o ${t.nome} não muda mais e a base de fatores do evento fica travada.`}
        >
          {fechado ? (
            <p className="text-sm text-muted-foreground">Inventário {t.nome} fechado.</p>
          ) : evento.podeGerir ? (
            <div className="space-y-2">
              {(alterado || r.pendencias > 0 || linhas.length === 0 || abertas > 0) && (
                <p className="text-xs text-muted-foreground">
                  {alterado ? (
                    "Salve antes de fechar."
                  ) : r.pendencias > 0 ? (
                    "Resolva os alertas antes de fechar."
                  ) : linhas.length === 0 ? (
                    "O inventário está vazio."
                  ) : (
                    <>
                      {abertas === 1
                        ? "Resolva a ocorrência aberta ou em tratamento"
                        : `Resolva as ${abertas} ocorrências abertas ou em tratamento`}{" "}
                      antes de fechar o inventário, em{" "}
                      <Link
                        to="/e/$eventoId/ocorrencias"
                        params={{ eventoId: evento.id }}
                        className="underline"
                      >
                        Ocorrências
                      </Link>
                      .
                    </>
                  )}
                </p>
              )}
              <Button
                variant="outline"
                disabled={
                  alterado ||
                  r.pendencias > 0 ||
                  linhas.length === 0 ||
                  abertas > 0 ||
                  fechar.isPending
                }
                onClick={() =>
                  window.confirm(
                    `Fechar o ${t.nome}? Depois disso ele não pode mais ser alterado.`,
                  ) && fechar.mutate()
                }
              >
                Fechar {t.nome}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Apenas o gestor do evento fecha o {t.nome}.
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
