/** Aba COLETA da Ferramenta: quadros que calculam a quantidade a lançar no inventário. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Carregando, Falha, formatarDataHora, PageHeader, Panel } from "@/components/kit";
import { SeloAlerta, TabelaEditavel, type Coluna } from "@/components/TabelaEditavel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calcularColeta,
  coletaSchema,
  OPCOES_COLETA as O,
  type Coleta,
} from "@/domain/metodologia/coleta";
import { useEvento } from "@/lib/evento-atual";
import { numero } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { coletaLancar, coletaObter, coletaSalvar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/coleta")({
  head: () => ({ meta: [{ title: "Coleta" }] }),
  component: ColetaExAnte,
});

type Q<K extends keyof Coleta> = Coleta[K] extends (infer L)[]
  ? L & Record<string, unknown>
  : never;

const QUADROS = [
  [
    "q1",
    "1. Energia elétrica",
    "Use as leituras do medidor OU a linha de conta de energia, nunca as duas para o mesmo consumo. Fotografe cada leitura. Seções 9.6.1 e 9.6.8 do Guia.",
  ],
  [
    "q2",
    "2. Geradores",
    "Um equipamento por linha. Ordem do dado: litros abastecidos; na falta deles, consumo da ficha técnica por hora × horas de operação. Potência × horas não dá litros. Seção 9.6.2 do Guia.",
  ],
  [
    "q3",
    "3. Alimentação",
    "Porção é o que uma pessoa recebe em um serviço. Ordem do dado: porções informadas; quilos servidos ÷ peso da porção (padrão 0,5 kg por refeição e 0,25 kg por coffee break); pessoas atendidas. Seções 3.4 e 9.6.3 do Guia.",
  ],
  [
    "q4",
    "4. Resíduos",
    "Ordem do dado: pesagem; contagem de recipientes × volume × quanto estava cheio × densidade (informada pela empresa de coleta). Guarde foto dos recipientes. Seções 9.6.4 e 9.6.5 do Guia.",
  ],
  [
    "q5",
    "5. Gases refrigerantes",
    "Só entra recarga ou manutenção com reposição de fluido feita em razão do evento. A simples existência de ar-condicionado não conta. Seção 9.6.6 do Guia.",
  ],
  [
    "q6",
    "6. Materiais e montagem",
    "Conta só o material novo, produzido para o evento. Material reutilizado ou locado de outros eventos fica registrado, mas não entra na conta. Seção 9.7.3 do Guia.",
  ],
  [
    "q7",
    "7. Deslocamento até o evento",
    "Uma linha por grupo de participantes com a mesma origem e o mesmo meio. Distâncias por trecho; ida e volta são dois trechos. Para carro, informe quantas pessoas por carro e o consumo (padrão: 10 km por litro). Seção 9.6.7 do Guia.",
  ],
  [
    "q8",
    "8. Hospedagem e transporte no destino",
    "Hospedagem: conte uma diária por quarto ocupado por noite. Transporte no destino: traslados e veículos contratados pelo evento. Se houver litros de combustível, eles têm preferência. Seções 9.6.7 e 9.7.3 do Guia.",
  ],
  [
    "resumo",
    "Resumo para lançar",
    "Itens e quantidades que a coleta calcula para o inventário ex-ante.",
  ],
] as const;

const vazioDe =
  <T extends Record<string, unknown>>(chaves: (keyof T)[], extra: Partial<T> = {}) =>
  () =>
    ({ ...Object.fromEntries(chaves.map((k) => [k, null])), ...extra }) as T;

function ColetaExAnte() {
  const evento = useEvento();
  const qc = useQueryClient();
  const chave = ["coleta", evento.id, "ex_ante"];
  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => coletaObter({ data: { eventoId: evento.id, etapa: "ex_ante" } }),
  });
  const [dados, setDados] = useState<Coleta | null>(null);
  const [versao, setVersao] = useState(0);
  const [alterado, setAlterado] = useState(false);
  const [aba, setAba] = useState<(typeof QUADROS)[number][0]>("q1");

  useEffect(() => {
    if (consulta.data && !alterado) {
      setDados(consulta.data.dados);
      setVersao(consulta.data.versao);
    }
  }, [consulta.data, alterado]);

  const c = useMemo(() => (dados ? calcularColeta(dados) : null), [dados]);

  const salvar = useMutation({
    mutationFn: (d: Coleta) =>
      coletaSalvar({ data: { eventoId: evento.id, etapa: "ex_ante", versao, dados: d } }),
    onSuccess: (r) => {
      setDados(r.dados);
      setVersao(r.versao);
      setAlterado(false);
      qc.setQueryData(chave, r);
      toast.success("Coleta salva.");
    },
    onError: (e) => toast.error(e.message),
  });
  const lancar = useMutation({
    mutationFn: () => coletaLancar({ data: { eventoId: evento.id, etapa: "ex_ante" } }),
    onSuccess: async (x) => {
      await qc.invalidateQueries({ queryKey: ["inventario", evento.id, "ex_ante"] });
      toast.success(
        `Lançado no ex-ante: ${x.novas} linha(s) nova(s), ${x.atualizadas} atualizada(s).`,
      );
    },
    onError: (e) => toast.error(e.message),
  });

  if (consulta.isLoading || (!dados && !consulta.error)) return <Carregando />;
  if (consulta.error || !dados || !c) return <Falha erro={consulta.error} />;

  const ro = !evento.podeEditar;
  const mudar = <K extends keyof Coleta>(k: K, v: Coleta[K]) => {
    setDados((d) => (d ? { ...d, [k]: v } : d));
    setAlterado(true);
  };
  const tabela = <K extends "q2" | "q3" | "q4" | "q6" | "q7" | "q8hoteis" | "q8transporte">(
    k: K,
    colunas: Coluna<Q<K>>[],
    calculadas: Parameters<typeof TabelaEditavel>[0]["calculadas"] = [],
    extra: Partial<Q<K>> = {},
  ) => (
    <TabelaEditavel<Q<K>>
      colunas={colunas}
      calculadas={calculadas}
      linhas={dados[k] as unknown as Q<K>[]}
      somenteLeitura={ro}
      novaLinha={vazioDe<Q<K>>(
        colunas.map((col) => col.chave),
        extra,
      )}
      onChange={(l) => mudar(k, l as unknown as Coleta[K])}
    />
  );
  const aviso = (i: number, lista: ({ alerta?: string | null } | null)[]) => (
    <SeloAlerta texto={lista[i]?.alerta} />
  );

  const conteudo: Record<(typeof QUADROS)[number][0], ReactNode> = {
    q1: (
      <div className="space-y-6">
        <TabelaEditavel<
          Q<"q1"> extends never ? never : Coleta["q1"]["leituras"][number] & Record<string, unknown>
        >
          colunas={[
            { chave: "data", rotulo: "Data", tipo: "data" },
            { chave: "momento", rotulo: "Momento", tipo: "opcao", opcoes: O.momentosDaLeitura },
            { chave: "leitura", rotulo: "Leitura do medidor (kWh)", tipo: "numero" },
            { chave: "documento", rotulo: "Foto ou documento", tipo: "texto" },
          ]}
          calculadas={[
            {
              rotulo: "Consumo desde a anterior (kWh)",
              alinhar: "direita",
              valor: (i) => numero(c.q1.consumoDesdeAnterior[i], 1),
            },
          ]}
          linhas={dados.q1.leituras as never}
          somenteLeitura={ro}
          rotuloNova="Adicionar leitura"
          novaLinha={() => ({ data: null, momento: null, leitura: null, documento: null }) as never}
          onChange={(l) => mudar("q1", { ...dados.q1, leituras: l as never })}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Dado rotulo="Consumo medido no período (kWh)" valor={numero(c.q1.medido, 1)} />
          <div className="space-y-1.5">
            <Label htmlFor="parcela">Parcela atribuída ao evento (%)</Label>
            <Input
              id="parcela"
              type="number"
              min={0}
              max={100}
              step="any"
              disabled={ro}
              value={dados.q1.parcela ?? ""}
              onChange={(e) =>
                mudar("q1", {
                  ...dados.q1,
                  parcela: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <Dado rotulo="Consumo atribuído ao evento (kWh)" valor={numero(c.q1.atribuido, 1)} />
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="criterio">Critério e justificativa do rateio</Label>
            <Input
              id="criterio"
              maxLength={500}
              disabled={ro}
              value={dados.q1.criterio ?? ""}
              onChange={(e) => mudar("q1", { ...dados.q1, criterio: e.target.value || null })}
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">
            Outras fontes de energia (conta, solar, contrato)
          </h3>
          <TabelaEditavel<Coleta["q1"]["outras"][number] & Record<string, unknown>>
            colunas={[
              { chave: "origem", rotulo: "Origem", tipo: "opcao", opcoes: O.origensDeEnergia },
              { chave: "funcao", rotulo: "Função", tipo: "opcao", opcoes: O.funcoesDeEnergia },
              { chave: "kwh", rotulo: "Energia (kWh)", tipo: "numero" },
              { chave: "comprovante", rotulo: "Comprovante", tipo: "texto" },
            ]}
            linhas={dados.q1.outras as never}
            somenteLeitura={ro}
            novaLinha={() =>
              ({ origem: null, funcao: null, kwh: null, comprovante: null }) as never
            }
            onChange={(l) => mudar("q1", { ...dados.q1, outras: l as never })}
          />
        </div>
      </div>
    ),
    q2: tabela(
      "q2",
      [
        { chave: "identificacao", rotulo: "Identificação", tipo: "texto" },
        { chave: "funcao", rotulo: "Função", tipo: "opcao", opcoes: O.funcoesDeGerador },
        { chave: "kva", rotulo: "Potência (kVA)", tipo: "numero" },
        { chave: "combustivel", rotulo: "Combustível", tipo: "opcao", opcoes: O.combustiveis },
        { chave: "abastecido", rotulo: "Quantidade abastecida", tipo: "numero" },
        { chave: "horas", rotulo: "Horas de operação", tipo: "numero" },
        { chave: "consumoHora", rotulo: "Consumo da ficha (por hora)", tipo: "numero" },
        { chave: "premissa", rotulo: "Premissa ou fonte da ficha", tipo: "texto" },
      ],
      [
        { rotulo: "Origem do dado", valor: (i) => c.q2[i]?.origem ?? "" },
        {
          rotulo: "Considerada",
          alinhar: "direita",
          valor: (i) => numero(c.q2[i]?.considerada, 2),
        },
        { rotulo: "Alerta", valor: (i) => aviso(i, c.q2) },
      ],
    ),
    q3: tabela(
      "q3",
      [
        { chave: "tipo", rotulo: "Tipo de porção", tipo: "opcao", opcoes: O.porcoes },
        { chave: "servico", rotulo: "Serviço", tipo: "opcao", opcoes: O.servicos },
        { chave: "pessoas", rotulo: "Pessoas atendidas", tipo: "numero" },
        { chave: "porcoes", rotulo: "Porções informadas", tipo: "numero" },
        { chave: "quilos", rotulo: "Quilos servidos", tipo: "numero" },
        { chave: "pesoPorcao", rotulo: "Peso de uma porção (kg)", tipo: "numero" },
        { chave: "premissa", rotulo: "Premissa", tipo: "texto" },
      ],
      [
        {
          rotulo: "Porções consideradas",
          alinhar: "direita",
          valor: (i) => numero(c.q3[i]?.consideradas, 1),
        },
        { rotulo: "Origem do dado", valor: (i) => c.q3[i]?.origem ?? "" },
      ],
    ),
    q4: tabela(
      "q4",
      [
        { chave: "destino", rotulo: "Destino", tipo: "opcao", opcoes: O.destinosDeResiduo },
        { chave: "tipo", rotulo: "Tipo de resíduo", tipo: "opcao", opcoes: O.tiposDeResiduo },
        { chave: "quilos", rotulo: "Quilos pesados", tipo: "numero" },
        { chave: "recipientes", rotulo: "Nº de recipientes", tipo: "numero" },
        { chave: "volume", rotulo: "Volume (litros)", tipo: "numero" },
        { chave: "cheio", rotulo: "Quanto estava cheio (%)", tipo: "numero" },
        { chave: "densidade", rotulo: "Densidade (kg/litro)", tipo: "numero" },
        { chave: "responsavel", rotulo: "Responsável pela coleta", tipo: "texto" },
        { chave: "documento", rotulo: "Documento (MTR, relatório, foto)", tipo: "texto" },
      ],
      [
        {
          rotulo: "Quilos considerados",
          alinhar: "direita",
          valor: (i) => numero(c.q4[i]?.considerados, 2),
        },
        { rotulo: "Forma do dado", valor: (i) => c.q4[i]?.forma ?? "" },
      ],
    ),
    q5: (
      <div className="space-y-4">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="recarga">
            Houve recarga ou manutenção com reposição de fluido em razão do evento?
          </Label>
          <select
            id="recarga"
            disabled={ro}
            value={dados.q5.houveRecarga ?? ""}
            onChange={(e) => mudar("q5", { ...dados.q5, houveRecarga: e.target.value || null })}
            className="h-9 w-40 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">—</option>
            {O.simNao.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
        <TabelaEditavel<Coleta["q5"]["linhas"][number] & Record<string, unknown>>
          colunas={[
            { chave: "fluido", rotulo: "Fluido", tipo: "opcao", opcoes: O.fluidos },
            { chave: "quilos", rotulo: "Quilos repostos", tipo: "numero" },
            { chave: "equipamento", rotulo: "Equipamento", tipo: "texto" },
            { chave: "ordemServico", rotulo: "Ordem de serviço", tipo: "texto" },
          ]}
          calculadas={[{ rotulo: "Alerta", valor: (i) => <SeloAlerta texto={c.q5[i]} /> }]}
          linhas={dados.q5.linhas as never}
          somenteLeitura={ro}
          novaLinha={() =>
            ({ fluido: null, quilos: null, equipamento: null, ordemServico: null }) as never
          }
          onChange={(l) => mudar("q5", { ...dados.q5, linhas: l as never })}
        />
      </div>
    ),
    q6: tabela(
      "q6",
      [
        { chave: "material", rotulo: "Material", tipo: "opcao", opcoes: O.materiais },
        { chave: "quilos", rotulo: "Quilos", tipo: "numero" },
        { chave: "condicao", rotulo: "Novo ou reutilizado", tipo: "opcao", opcoes: O.condicoes },
        { chave: "origem", rotulo: "Origem", tipo: "opcao", opcoes: O.origensDeMaterial },
        {
          chave: "destinacao",
          rotulo: "Destinação após o evento",
          tipo: "opcao",
          opcoes: O.destinacoes,
        },
        { chave: "comprovante", rotulo: "Comprovante", tipo: "texto" },
      ],
      [{ rotulo: "Quilos considerados", alinhar: "direita", valor: (i) => numero(c.q6[i], 2) }],
    ),
    q7: tabela(
      "q7",
      [
        { chave: "municipio", rotulo: "Município de origem", tipo: "texto" },
        { chave: "uf", rotulo: "UF", tipo: "texto", largura: "4rem" },
        { chave: "pessoas", rotulo: "Pessoas", tipo: "numero" },
        { chave: "meio", rotulo: "Meio principal", tipo: "opcao", opcoes: O.meios },
        { chave: "distancia", rotulo: "Distância por trecho (km)", tipo: "numero" },
        { chave: "trechos", rotulo: "Trechos por pessoa", tipo: "numero" },
        { chave: "aeroporto", rotulo: "Aeroporto de chegada", tipo: "texto" },
        {
          chave: "complementar",
          rotulo: "Transporte complementar",
          tipo: "opcao",
          opcoes: O.complementares,
        },
        { chave: "distanciaComplementar", rotulo: "Distância complementar (km)", tipo: "numero" },
        { chave: "pessoasPorCarro", rotulo: "Pessoas por carro", tipo: "numero" },
        { chave: "kmPorLitro", rotulo: "Km por litro (carro)", tipo: "numero" },
      ],
      [
        { rotulo: "Faixa do voo", valor: (i) => c.q7[i]?.faixa ?? "" },
        { rotulo: "Avião (pass.km)", alinhar: "direita", valor: (i) => numero(c.q7[i]?.aviao, 0) },
        {
          rotulo: "Ônibus (pass.km)",
          alinhar: "direita",
          valor: (i) => numero(c.q7[i]?.onibus, 0),
        },
        { rotulo: "Carro (litros)", alinhar: "direita", valor: (i) => numero(c.q7[i]?.carro, 1) },
        { rotulo: "Conferência", valor: (i) => <SeloAlerta texto={c.q7[i]?.conferencia} /> },
      ],
      { trechos: 2 } as never,
    ),
    q8: (
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">Hospedagem</h3>
          {tabela("q8hoteis", [
            { chave: "hotel", rotulo: "Hotel", tipo: "texto" },
            { chave: "municipio", rotulo: "Município", tipo: "texto" },
            { chave: "hospedes", rotulo: "Hóspedes", tipo: "numero" },
            { chave: "diarias", rotulo: "Diárias (quartos por noite)", tipo: "numero" },
            { chave: "distancia", rotulo: "Distância até o local (km)", tipo: "numero" },
            { chave: "comprovante", rotulo: "Comprovante", tipo: "texto" },
          ])}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Transporte no destino</h3>
          {tabela(
            "q8transporte",
            [
              { chave: "servico", rotulo: "Serviço", tipo: "opcao", opcoes: O.servicosNoDestino },
              { chave: "rota", rotulo: "Rota", tipo: "texto" },
              { chave: "distancia", rotulo: "Distância por viagem (km)", tipo: "numero" },
              { chave: "viagens", rotulo: "Viagens", tipo: "numero" },
              { chave: "passageiros", rotulo: "Passageiros por viagem", tipo: "numero" },
              { chave: "litros", rotulo: "Litros, se informados", tipo: "numero" },
              { chave: "kmPorLitro", rotulo: "Km por litro (sem litros)", tipo: "numero" },
            ],
            [
              {
                rotulo: "Pass.km (ônibus)",
                alinhar: "direita",
                valor: (i) => numero(c.q8[i]?.passageiroKm, 0),
              },
              {
                rotulo: "Litros considerados",
                alinhar: "direita",
                valor: (i) => numero(c.q8[i]?.litros, 1),
              },
            ],
          )}
        </div>
      </div>
    ),
    resumo: (
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Item (o mesmo do inventário)</th>
            <th className="py-2 text-right font-medium">Quantidade</th>
            <th className="py-2 pl-4 font-medium">Vem do</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {c.resumo.map((r) => (
            <tr key={r.item} className={r.quantidade > 0 ? "" : "text-muted-foreground"}>
              <td className="py-1.5">{r.item}</td>
              <td className="py-1.5 text-right tabular-nums">{numero(r.quantidade, 2)}</td>
              <td className="py-1.5 pl-4">{r.quadro}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  };

  const atual = QUADROS.find((q) => q[0] === aba)!;

  return (
    <>
      <PageHeader
        eyebrow="Pré-evento · Aba COLETA da Ferramenta"
        title="Coleta (previsão)"
        description="Preencha os quadros com o que for previsto. Cada quadro calcula a quantidade final, e o resumo mostra o que lançar no inventário ex-ante."
        actions={
          !ro && (
            <>
              <Button
                variant="outline"
                disabled={alterado || lancar.isPending}
                onClick={() => lancar.mutate()}
                title={alterado ? "Salve antes de lançar" : undefined}
              >
                Lançar no ex-ante
              </Button>
              <Button
                disabled={!alterado || salvar.isPending}
                onClick={() => {
                  const v = coletaSchema.safeParse(dados);
                  if (!v.success) toast.error(v.error.issues[0]?.message ?? "Revise os campos.");
                  else salvar.mutate(v.data);
                }}
              >
                {salvar.isPending ? "Salvando…" : alterado ? "Salvar coleta" : "Coleta salva"}
              </Button>
            </>
          )
        }
      />
      {c.pendencias.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
          {c.pendencias.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      <div role="tablist" aria-label="Quadros da coleta" className="flex flex-wrap gap-1.5">
        {QUADROS.map(([k, rotulo]) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={aba === k}
            onClick={() => setAba(k)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              aba === k
                ? "border-transparent bg-brand font-medium text-brand-foreground"
                : "border-border hover:bg-muted",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <Panel title={atual[1]} hint={atual[2]}>
        <fieldset disabled={ro}>{conteudo[aba]}</fieldset>
      </Panel>
      <p className="text-xs text-muted-foreground">
        {consulta.data?.atualizadoEm
          ? `Última gravação: ${formatarDataHora(consulta.data.atualizadoEm)} por ${consulta.data.atualizadoPor}. `
          : ""}
        Depois de lançar, confira o resultado em{" "}
        <Link to="/e/$eventoId/inventario" params={{ eventoId: evento.id }} className="underline">
          Inventário ex-ante
        </Link>
        .
      </p>
    </>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{rotulo}</p>
      <p className="flex h-9 items-center rounded-md bg-muted px-3 text-sm tabular-nums">{valor}</p>
    </div>
  );
}
