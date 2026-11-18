/**
 * Aba COLETA da Ferramenta v3.16: quadros de apoio que calculam a quantidade a
 * lançar no inventário. São as regras de mapeamento entre o dado bruto do
 * evento (leitura de medidor, litros, porções, pesagem, viagens) e o item da
 * base de fatores. As referências entre colchetes apontam as células.
 */
import { z } from "zod";
import { BASE_V3_16, DESCRICOES_POR_CATEGORIA } from "./inventario";

const itensDaCategoria = (cat: string) =>
  BASE_V3_16.itens.filter((i) => i.categoria === cat).map((i) => i.item);

export const OPCOES_COLETA = {
  momentosDaLeitura: ["Início da montagem", "Leitura diária", "Fim da desmontagem"],
  origensDeEnergia: [
    "Rede elétrica - conta ou rateio",
    "Solar gerada no local",
    "Contrato ou certificado renovável",
  ],
  funcoesDeEnergia: ["Principal", "Complementar"],
  funcoesDeGerador: ["Principal", "Apoio", "Emergência"],
  combustiveis: ["Diesel (litros)", "GLP (kg)", "Gás natural (m³)"],
  porcoes: itensDaCategoria("5 Alimentação"),
  servicos: (DESCRICOES_POR_CATEGORIA["5 Alimentação"] ?? []).slice(0, 8),
  destinosDeResiduo: itensDaCategoria("8 Resíduos"),
  tiposDeResiduo: (DESCRICOES_POR_CATEGORIA["8 Resíduos"] ?? []).slice(0, 4),
  fluidos: itensDaCategoria("10 Fugitivas"),
  materiais: itensDaCategoria("6 Materiais"),
  condicoes: ["Novo", "Reutilizado", "Locado"],
  origensDeMaterial: ["Local", "Outra região"],
  destinacoes: ["Reutilização", "Devolvido ao locador", "Doação", "Reciclagem", "Aterro"],
  meios: ["Avião", "Ônibus rodoviário ou fretado", "Carro"],
  complementares: ["Nenhum", "Ônibus rodoviário ou fretado", "Carro"],
  servicosNoDestino: ["Ônibus fretado", "Van a diesel", "Carro a gasolina"],
  simNao: ["Sim", "Não"],
} as const;

const num = z.number().finite().min(0).max(1e12).nullable();
const txt = z.string().trim().max(500).nullable();
const umDe = (l: readonly string[]) =>
  z
    .string()
    .nullable()
    .refine((v) => v === null || l.includes(v), { message: "Opção inválida." });
const lista = <T extends z.ZodTypeAny>(linha: T) => z.array(linha).max(200);
const O = OPCOES_COLETA;

export const coletaSchema = z.object({
  q1: z.object({
    leituras: lista(
      z.object({ data: txt, momento: umDe(O.momentosDaLeitura), leitura: num, documento: txt }),
    ),
    parcela: z.number().finite().min(0).max(100).nullable(),
    criterio: txt,
    outras: lista(
      z.object({
        origem: umDe(O.origensDeEnergia),
        funcao: umDe(O.funcoesDeEnergia),
        kwh: num,
        comprovante: txt,
      }),
    ),
  }),
  q2: lista(
    z.object({
      identificacao: txt,
      funcao: umDe(O.funcoesDeGerador),
      kva: num,
      combustivel: umDe(O.combustiveis),
      abastecido: num,
      horas: num,
      consumoHora: num,
      premissa: txt,
    }),
  ),
  q3: lista(
    z.object({
      tipo: umDe(O.porcoes),
      servico: umDe(O.servicos),
      pessoas: num,
      porcoes: num,
      quilos: num,
      pesoPorcao: num,
      premissa: txt,
    }),
  ),
  q4: lista(
    z.object({
      destino: umDe(O.destinosDeResiduo),
      tipo: umDe(O.tiposDeResiduo),
      quilos: num,
      recipientes: num,
      volume: num,
      cheio: z.number().finite().min(0).max(100).nullable(),
      densidade: num,
      responsavel: txt,
      documento: txt,
    }),
  ),
  q5: z.object({
    houveRecarga: umDe(O.simNao),
    linhas: lista(
      z.object({ fluido: umDe(O.fluidos), quilos: num, equipamento: txt, ordemServico: txt }),
    ),
  }),
  q6: lista(
    z.object({
      material: umDe(O.materiais),
      quilos: num,
      condicao: umDe(O.condicoes),
      origem: umDe(O.origensDeMaterial),
      destinacao: umDe(O.destinacoes),
      comprovante: txt,
    }),
  ),
  q7: lista(
    z.object({
      municipio: txt,
      uf: txt,
      pessoas: num,
      meio: umDe(O.meios),
      distancia: num,
      trechos: num,
      aeroporto: txt,
      complementar: umDe(O.complementares),
      distanciaComplementar: num,
      pessoasPorCarro: num,
      kmPorLitro: num,
    }),
  ),
  q8hoteis: lista(
    z.object({
      hotel: txt,
      municipio: txt,
      hospedes: num,
      diarias: num,
      distancia: num,
      comprovante: txt,
    }),
  ),
  q8transporte: lista(
    z.object({
      servico: umDe(O.servicosNoDestino),
      rota: txt,
      distancia: num,
      viagens: num,
      passageiros: num,
      litros: num,
      kmPorLitro: num,
    }),
  ),
});

export type Coleta = z.infer<typeof coletaSchema>;

export function coletaVazia(): Coleta {
  return {
    q1: { leituras: [], parcela: null, criterio: null, outras: [] },
    q2: [],
    q3: [],
    q4: [],
    q5: { houveRecarga: null, linhas: [] },
    q6: [],
    q7: [],
    q8hoteis: [],
    q8transporte: [],
  };
}

/** Equivalente a N(): número fica, o resto vira zero. */
const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

const COFFEE = "Coffee break ou lanche (porção)";

export function calcularColeta(c: Coleta) {
  // Quadro 1 — energia [C55, C57, F44:F54]
  const leituras = c.q1.leituras
    .map((l) => l.leitura)
    .filter((v): v is number => typeof v === "number");
  const medido = leituras.length < 2 ? 0 : Math.max(...leituras) - Math.min(...leituras);
  const atribuido = (medido * n(c.q1.parcela)) / 100;
  const consumoDesdeAnterior = c.q1.leituras.map((l, i) => {
    const ant = c.q1.leituras[i - 1]?.leitura;
    return i === 0 || l.leitura === null || ant === null || ant === undefined
      ? null
      : l.leitura - ant;
  });
  const somaOutras = (origem: string) =>
    c.q1.outras.reduce((a, o) => a + (o.origem === origem ? n(o.kwh) : 0), 0);

  // Quadro 2 — geradores [J70:M75]
  const q2 = c.q2.map((g) => {
    if (!g.combustivel) return { origem: null, considerada: null, alerta: null };
    const origem =
      n(g.abastecido) > 0
        ? "Medido"
        : n(g.horas) > 0 && n(g.consumoHora) > 0
          ? "Ficha técnica"
          : "Falta dado";
    const considerada = n(g.abastecido) > 0 ? n(g.abastecido) : n(g.horas) * n(g.consumoHora);
    const alerta =
      origem === "Falta dado"
        ? "Informe litros ou horas e consumo da ficha"
        : origem === "Ficha técnica" && !g.premissa
          ? "Escreva a fonte da ficha técnica"
          : "OK";
    return { origem, considerada, alerta };
  });

  // Quadro 3 — alimentação [I80:J91]
  const q3 = c.q3.map((a) => {
    if (!a.tipo) return { consideradas: null, origem: null };
    const peso = n(a.pesoPorcao) > 0 ? n(a.pesoPorcao) : a.tipo === COFFEE ? 0.25 : 0.5;
    const consideradas =
      n(a.porcoes) > 0 ? n(a.porcoes) : n(a.quilos) > 0 ? n(a.quilos) / peso : n(a.pessoas);
    const origem =
      n(a.porcoes) > 0
        ? "Informado pelo fornecedor"
        : n(a.quilos) > 0
          ? "Convertido de quilos"
          : n(a.pessoas) > 0
            ? "Estimado por pessoas"
            : "Falta dado";
    return { consideradas, origem };
  });

  // Quadro 4 — resíduos [J96:K105]
  const q4 = c.q4.map((r) => {
    if (!r.destino) return { considerados: null, forma: null };
    const cheio = n(r.cheio) > 0 ? n(r.cheio) : 100;
    const considerados =
      n(r.quilos) > 0
        ? n(r.quilos)
        : (n(r.recipientes) * n(r.volume) * cheio * n(r.densidade)) / 100;
    const forma =
      n(r.quilos) > 0
        ? "Pesado"
        : n(r.recipientes) * n(r.volume) * n(r.densidade) > 0
          ? "Estimado por volume"
          : "Falta dado";
    return { considerados, forma };
  });

  // Quadro 5 — gases refrigerantes [G112:G116]
  const q5 = c.q5.linhas.map((g) =>
    !g.fluido
      ? null
      : c.q5.houveRecarga === "Não"
        ? "Você respondeu Não: esta linha não entra"
        : !c.q5.houveRecarga
          ? "Responda a pergunta acima"
          : n(g.quilos) === 0
            ? "Falta a quantidade"
            : "OK",
  );

  // Quadro 6 — materiais: só o material novo entra [H121:H130]
  const q6 = c.q6.map((m) => (!m.material ? null : m.condicao === "Novo" ? n(m.quilos) : 0));

  // Quadro 7 — deslocamento até o evento [N135:R154]
  const litrosDeCarro = (
    pessoas: number,
    porCarro: number,
    dist: number,
    trechos: number,
    kml: number,
  ) => ((porCarro > 0 ? pessoas / porCarro : pessoas) * dist * trechos) / (kml > 0 ? kml : 10);
  const q7 = c.q7.map((v) => {
    const p = n(v.pessoas);
    const t = n(v.trechos);
    const faixa =
      v.meio !== "Avião"
        ? null
        : n(v.distancia) <= 500
          ? "curto"
          : n(v.distancia) <= 3700
            ? "médio"
            : "longo";
    const aviao = v.meio === "Avião" ? p * n(v.distancia) * t : 0;
    const onibus =
      (v.meio === "Ônibus rodoviário ou fretado" ? p * n(v.distancia) * t : 0) +
      (v.complementar === "Ônibus rodoviário ou fretado" ? p * n(v.distanciaComplementar) * t : 0);
    const carro =
      (v.meio === "Carro"
        ? litrosDeCarro(p, n(v.pessoasPorCarro), n(v.distancia), t, n(v.kmPorLitro))
        : 0) +
      (v.complementar === "Carro"
        ? litrosDeCarro(p, n(v.pessoasPorCarro), n(v.distanciaComplementar), t, n(v.kmPorLitro))
        : 0);
    const conferencia = !v.meio
      ? null
      : p === 0 || n(v.distancia) === 0
        ? "Falta pessoas ou distância"
        : "OK";
    return { faixa, aviao, onibus, carro, conferencia };
  });

  // Quadro 8 — transporte no destino [J169:K176]
  const q8 = c.q8transporte.map((s) => {
    const passageiroKm =
      s.servico === "Ônibus fretado" && n(s.litros) === 0
        ? n(s.distancia) * n(s.viagens) * n(s.passageiros)
        : 0;
    const litros = !s.servico
      ? null
      : n(s.litros) > 0
        ? n(s.litros)
        : s.servico === "Ônibus fretado"
          ? 0
          : (n(s.distancia) * n(s.viagens)) /
            (n(s.kmPorLitro) > 0 ? n(s.kmPorLitro) : s.servico === "Van a diesel" ? 8 : 10);
    return { passageiroKm, litros };
  });

  const somaPor = <T>(
    linhas: T[],
    chave: (l: T) => string | null,
    valor: (l: T, i: number) => number | null,
  ) => {
    const m = new Map<string, number>();
    linhas.forEach((l, i) => {
      const k = chave(l);
      if (k) m.set(k, (m.get(k) ?? 0) + n(valor(l, i)));
    });
    return (k: string) => m.get(k) ?? 0;
  };
  const gerador = somaPor(
    c.q2,
    (g) => g.combustivel,
    (_g, i) => q2[i]!.considerada,
  );
  const porcao = somaPor(
    c.q3,
    (a) => a.tipo,
    (_a, i) => q3[i]!.consideradas,
  );
  const residuo = somaPor(
    c.q4,
    (r) => r.destino,
    (_r, i) => q4[i]!.considerados,
  );
  const fluido = somaPor(
    c.q5.linhas,
    (g) => g.fluido,
    (g) => g.quilos,
  );
  const material = somaPor(
    c.q6,
    (m) => m.material,
    (_m, i) => q6[i]!,
  );
  const faixa = somaPor(
    q7,
    (v) => v.faixa,
    (v) => v.aviao,
  );
  const servico = somaPor(
    c.q8transporte,
    (s) => s.servico,
    (_s, i) => q8[i]!.litros,
  );
  const soma = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + n(b), 0);
  const recarga = c.q5.houveRecarga === "Sim";

  // Resumo para lançar no inventário [B6:F36], na ordem da planilha.
  const resumo: { item: string; quantidade: number; quadro: string }[] = [
    [
      "Energia elétrica da rede (kWh)",
      atribuido + somaOutras("Rede elétrica - conta ou rateio"),
      "Quadro 1",
    ],
    [
      "Energia elétrica com contrato ou certificado próprio (kWh)",
      somaOutras("Contrato ou certificado renovável"),
      "Quadro 1",
    ],
    ["Energia solar gerada no local (kWh)", somaOutras("Solar gerada no local"), "Quadro 1"],
    ["Diesel em gerador (litro)", gerador("Diesel (litros)"), "Quadro 2"],
    ["GLP em equipamento (kg)", gerador("GLP (kg)"), "Quadro 2"],
    ["Gas natural em equipamento (m³)", gerador("Gás natural (m³)"), "Quadro 2"],
    ...O.porcoes.map((p) => [p, porcao(p), "Quadro 3"] as const),
    ...O.destinosDeResiduo.map((d) => [d, residuo(d), "Quadro 4"] as const),
    ...O.fluidos.map((f) => [f, recarga ? fluido(f) : 0, "Quadro 5"] as const),
    ...O.materiais.map((m) => [m, material(m), "Quadro 6"] as const),
    ["Avião - trecho curto, até 500 km (passageiro.km)", faixa("curto"), "Quadro 7"],
    ["Avião - trecho médio, 500 a 3.700 km (passageiro.km)", faixa("médio"), "Quadro 7"],
    ["Avião - trecho longo, acima de 3.700 km (passageiro.km)", faixa("longo"), "Quadro 7"],
    [
      "Ônibus rodoviário ou fretado (passageiro.km)",
      soma(q7.map((v) => v.onibus)) + soma(q8.map((s) => s.passageiroKm)),
      "Quadros 7 e 8",
    ],
    [
      "Carro a gasolina (litro)",
      soma(q7.map((v) => v.carro)) + servico("Carro a gasolina"),
      "Quadros 7 e 8",
    ],
    ["Diária de hospedagem (diária)", soma(c.q8hoteis.map((h) => h.diarias)), "Quadro 8"],
    ["Ônibus fretado - por litro de diesel", servico("Ônibus fretado"), "Quadro 8"],
    ["Carro ou van a diesel (litro)", servico("Van a diesel"), "Quadro 8"],
  ].map(([item, quantidade, quadro]) => ({
    item: item as string,
    quantidade: quantidade as number,
    quadro: quadro as string,
  }));

  const pendencias = [
    ...(leituras.length >= 2 && c.q1.parcela === null
      ? [
          "Quadro 1: informe a parcela do consumo atribuída ao evento (sem ela, o consumo medido conta zero).",
        ]
      : []),
    ...q2.filter((g) => g.alerta && g.alerta !== "OK").map((g) => `Quadro 2: ${g.alerta}`),
    ...q3.filter((a) => a.origem === "Falta dado").map(() => "Quadro 3: porção sem dado"),
    ...q4.filter((r) => r.forma === "Falta dado").map(() => "Quadro 4: resíduo sem dado"),
    ...q5.filter((a) => a && a !== "OK").map((a) => `Quadro 5: ${a}`),
    ...q7
      .filter((v) => v.conferencia && v.conferencia !== "OK")
      .map((v) => `Quadro 7: ${v.conferencia}`),
  ];

  return {
    q1: { medido, atribuido, consumoDesdeAnterior },
    q2,
    q3,
    q4,
    q5,
    q6,
    q7,
    q8,
    resumo,
    pendencias,
  };
}
