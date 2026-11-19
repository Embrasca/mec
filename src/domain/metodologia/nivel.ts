/**
 * Motor de enquadramento: reproduz a aba "A - CARACTERIZAÇÃO" da Ferramenta
 * MEC/GIZ v3.16, célula a célula. As referências entre colchetes apontam a
 * célula da planilha que cada valor espelha.
 *
 * Função pura, sem banco e sem relógio: o mesmo resultado no navegador, no
 * servidor e nos testes que comparam com a planilha.
 */
import type { Caracterizacao, PeriodoDoEvento } from "./caracterizacao";
import {
  ALEGACAO_CARBONO_NEUTRO,
  CRITERIO_LOGISTICA,
  V3_16,
  designacao,
  type Nivel,
} from "./v3_16";

export type Determinante =
  | "Número de participantes por dia"
  | "Gatilho automático"
  | "Pontuação de complexidade"
  | "Elevação técnica";

export interface Gatilho {
  condicao: string;
  situacao: string;
  acionado: boolean;
}

export interface Divergencia {
  criterio: string;
  escolhida: string | null;
  indicadaPelosDados: string;
  motivo: string;
}

export interface Enquadramento {
  dias: number | null; // [C16]
  haInternacionaisPresenciais: boolean; // [C25]
  totalModal: number; // [C38]
  conferenciaModal: string; // [B39]
  etapa1: Nivel | null; // [C61]
  pontos: number[]; // [D65:D74]
  opcaoLogistica: string; // [C73]
  totalPontos: number; // [D75]
  etapa2: Nivel; // [D76]
  gatilhos: Gatilho[]; // [B80:D91]
  gatilhosAcionados: number; // [D93]
  etapa3: Nivel; // [D94]
  elevacao: Nivel | null; // [C97]
  conferenciaElevacao: "SEM ELEVAÇÃO" | "OK" | "FALTA A JUSTIFICATIVA"; // [C99]
  definiu: [boolean, boolean, boolean, boolean]; // [D103:D106]
  nivelFinal: Nivel | null; // [C108]
  designacao: string | null; // [D108]
  determinante: Determinante | null; // [C109]
  oQueMudaria: { seAcontecer: string; nivelMinimo: number; jaE: boolean }[]; // [B113:D121]
  /** Avisos que impedem confirmar o enquadramento. */
  pendencias: string[];
  /**
   * Melhoria do sistema (não existe na planilha): opções de complexidade que
   * ficaram abaixo do que os números da ficha indicam. Só avisa; não muda a conta.
   */
  divergencias: Divergencia[];
}

/** Equivalente a N() do Excel: número fica, vazio vira zero. */
const n = (v: number | null | undefined): number => (typeof v === "number" ? v : 0);

export function diasDoEvento(p: PeriodoDoEvento): number | null {
  if (!p.dataInicio || !p.dataFim) return null;
  const ms = Date.parse(`${p.dataFim}T00:00:00Z`) - Date.parse(`${p.dataInicio}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86_400_000) + 1;
}

function nivelPorParticipantes(porDia: number | null): Nivel | null {
  if (porDia === null) return null;
  if (porDia <= 80) return 1;
  if (porDia <= 250) return 2;
  if (porDia <= 1000) return 3;
  return 4;
}

function nivelPorPontos(total: number): Nivel {
  if (total <= 6) return 1;
  if (total <= 13) return 2;
  if (total <= 21) return 3;
  return 4;
}

const ehLogisticaLonga = (v: string | null) => v === "Interestadual" || v === "Internacional";

export function calcularEnquadramento(c: Caracterizacao, periodo: PeriodoDoEvento): Enquadramento {
  const dias = diasDoEvento(periodo);
  const pctAereo = n(c.percentualAereo);

  const somaSemAereo =
    n(c.pctOnibus) + n(c.pctCarro) + n(c.pctTrem) + n(c.pctLocal) + n(c.pctOutros);
  const totalModal = pctAereo + somaSemAereo;
  const conferenciaModal =
    somaSemAereo === 0
      ? "Preencha a divisão por meio de transporte"
      : Math.abs(totalModal - 100) > 0.5
        ? "ATENÇÃO: os percentuais devem somar 100%"
        : "OK";

  // Etapa 1
  const etapa1 = nivelPorParticipantes(c.participantesDia);

  // Etapa 2: a pontuação é a posição da opção na lista (0 a 3). O critério de
  // logística usa a célula C49, ou "Municipal" se ela estiver vazia [C73].
  const opcaoLogistica = c.logistica ?? "Municipal";
  const pontos = V3_16.criteriosComplexidade.map((criterio, i) => {
    const escolhida = i === CRITERIO_LOGISTICA ? opcaoLogistica : c.complexidade[i];
    const indice = escolhida == null ? -1 : criterio.opcoes.indexOf(escolhida);
    return indice < 0 ? 0 : indice;
  });
  const totalPontos = pontos.reduce((a, b) => a + b, 0);
  const etapa2 = nivelPorPontos(totalPontos);

  // Etapa 3: gatilhos automáticos, na ordem da planilha [D80:D91]
  const kva = n(c.potenciaGeradoresKva);
  const geradores = n(c.numeroGeradores);
  const situacoes: [string, boolean][] = [
    [`${n(c.internacionaisPresenciais)} pessoa(s)`, n(c.internacionaisPresenciais) > 10],
    [`${c.percentualAereo ?? ""}%`, pctAereo > 20],
    [`${n(c.vooInternacional)} pessoa(s)`, n(c.vooInternacional) > 10],
    [c.transporteAquaviario ?? "", c.transporteAquaviario === "Sim"],
    [`${c.locaisSimultaneos ?? ""} local(is)`, n(c.locaisSimultaneos) > 2],
    [`${dias ?? ""} dia(s)`, n(dias) >= 5],
    [
      `${c.potenciaGeradoresKva ?? ""} kVA / ${c.numeroGeradores ?? ""} ger.`,
      kva > 50 || geradores > 1,
    ],
    [`${c.diariasHospedagem ?? ""} diárias`, n(c.diariasHospedagem) > 500],
    [c.logistica ?? "", ehLogisticaLonga(c.logistica)],
    [c.alegacao ?? "", c.alegacao === ALEGACAO_CARBONO_NEUTRO],
    [`${c.areaEstruturaM2 ?? ""} m²`, n(c.areaEstruturaM2) > 1000],
    [c.itinerante ?? "", c.itinerante === "Sim"],
  ];
  const gatilhos: Gatilho[] = V3_16.gatilhos.map((g, i) => ({
    condicao: g.condicao,
    situacao: situacoes[i]![0],
    acionado: situacoes[i]![1],
  }));
  const gatilhosAcionados = gatilhos.filter((g) => g.acionado).length;
  const etapa3: Nivel = gatilhosAcionados >= 3 ? 4 : gatilhosAcionados >= 1 ? 3 : 1;

  // Etapa 4: elevação técnica [C97, C99]
  const elevacao = c.elevacaoTecnica;
  const maiorSemElevacao = Math.max(etapa1 ?? 0, etapa2, etapa3);
  const conferenciaElevacao =
    n(elevacao) > maiorSemElevacao
      ? c.justificativaElevacao
        ? "OK"
        : "FALTA A JUSTIFICATIVA"
      : "SEM ELEVAÇÃO";

  // Resultado [C108]: vazio enquanto a etapa 1 estiver vazia.
  const nivelFinal: Nivel | null =
    etapa1 === null ? null : (Math.max(etapa1, etapa2, etapa3, elevacao ?? 0) as Nivel);
  const etapas = [etapa1, etapa2, etapa3, elevacao] as const;
  const definiu = etapas.map((e) => e !== null && e === nivelFinal) as Enquadramento["definiu"];

  // Ordem de prioridade da planilha [C109]: participantes, gatilho, pontuação, elevação.
  const determinante: Determinante | null =
    nivelFinal === null
      ? null
      : etapa1 === nivelFinal
        ? "Número de participantes por dia"
        : etapa3 === nivelFinal
          ? "Gatilho automático"
          : etapa2 === nivelFinal
            ? "Pontuação de complexidade"
            : "Elevação técnica";

  const pd = n(c.participantesDia);
  const jaE = [
    pd > 250,
    pd > 1000,
    pctAereo > 20,
    n(dias) >= 5,
    n(c.areaEstruturaM2) > 1000,
    kva > 50 || geradores > 1,
    ehLogisticaLonga(c.logistica),
    c.alegacao === ALEGACAO_CARBONO_NEUTRO,
    gatilhosAcionados >= 3,
  ];

  const pendencias: string[] = [];
  if (c.participantesDia === null) pendencias.push("Informe os participantes previstos por dia.");
  if (dias === null) pendencias.push("Informe as datas de início e término no cadastro do evento.");
  if (dias !== null && dias < 1) pendencias.push("A data de término é anterior à de início.");
  if (conferenciaModal !== "OK") pendencias.push(conferenciaModal);
  if (conferenciaElevacao === "FALTA A JUSTIFICATIVA")
    pendencias.push("A elevação técnica exige justificativa.");
  c.complexidade.forEach((v, i) => {
    if (i !== CRITERIO_LOGISTICA && v === null)
      pendencias.push(
        `Escolha a opção de complexidade: ${V3_16.criteriosComplexidade[i]!.rotulo}.`,
      );
  });

  return {
    dias,
    haInternacionaisPresenciais: n(c.internacionaisPresenciais) > 0,
    totalModal,
    conferenciaModal,
    etapa1,
    pontos,
    opcaoLogistica,
    totalPontos,
    etapa2,
    gatilhos,
    gatilhosAcionados,
    etapa3,
    elevacao,
    conferenciaElevacao,
    definiu,
    nivelFinal,
    designacao: nivelFinal === null ? null : designacao(nivelFinal),
    determinante,
    oQueMudaria: V3_16.oQueMudaria.map((m, i) => ({ ...m, jaE: jaE[i]! })),
    pendencias,
    divergencias: divergenciasDeComplexidade(c, dias),
  };
}

/**
 * Compara as opções escolhidas com o que os números da própria ficha indicam.
 * Só aponta quando a opção ficou ABAIXO do mínimo que os dados sustentam, e só
 * nos critérios em que a relação é direta. A decisão continua com o usuário.
 */
export function divergenciasDeComplexidade(c: Caracterizacao, dias: number | null): Divergencia[] {
  const criterios = V3_16.criteriosComplexidade;
  const minimos: { i: number; minimo: number | null; motivo: string }[] = [
    {
      i: 0,
      minimo: dias === null || dias < 1 ? null : dias >= 5 ? 3 : dias >= 3 ? 2 : dias - 1,
      motivo: `o evento tem ${dias ?? "?"} dia(s)`,
    },
    {
      i: 2,
      minimo:
        n(c.areaEstruturaM2) > 500 || n(c.locaisSimultaneos) > 1
          ? 3
          : n(c.areaEstruturaM2) > 0
            ? 2
            : null,
      motivo: `estrutura temporária de ${n(c.areaEstruturaM2)} m² e ${n(c.locaisSimultaneos)} local(is)`,
    },
    {
      i: 3,
      // Só o percentual: o exemplo oficial da Ferramenta tem 6 voos internacionais e
      // escolhe "Outros estados ou até 20% aéreo".
      minimo: n(c.percentualAereo) > 20 ? 3 : null,
      motivo: `${n(c.percentualAereo)}% dos participantes com viagem aérea`,
    },
    {
      i: 4,
      minimo:
        c.diariasHospedagem === null
          ? null
          : c.diariasHospedagem > 500
            ? 3
            : c.diariasHospedagem > 100
              ? 2
              : c.diariasHospedagem > 0
                ? 1
                : null,
      motivo: `${n(c.diariasHospedagem)} diárias de hospedagem previstas`,
    },
    {
      i: 5,
      minimo:
        c.porcoesAlimentacao === null
          ? null
          : c.porcoesAlimentacao > 2000
            ? 3
            : c.porcoesAlimentacao > 500
              ? 2
              : c.porcoesAlimentacao > 0
                ? 1
                : null,
      motivo: `${n(c.porcoesAlimentacao)} porções previstas`,
    },
    {
      i: 6,
      minimo:
        n(c.potenciaGeradoresKva) > 50 || n(c.numeroGeradores) > 1
          ? 3
          : n(c.potenciaGeradoresKva) > 0 || n(c.numeroGeradores) > 0
            ? 2
            : null,
      motivo: `${n(c.potenciaGeradoresKva)} kVA em ${n(c.numeroGeradores)} gerador(es)`,
    },
    {
      i: 9,
      minimo: c.alegacao === ALEGACAO_CARBONO_NEUTRO ? 2 : null,
      motivo: "a alegação pretendida é de evento carbono neutro",
    },
  ];
  const out: Divergencia[] = [];
  for (const { i, minimo, motivo } of minimos) {
    if (minimo === null) continue;
    const criterio = criterios[i]!;
    const escolhida = c.complexidade[i] ?? null;
    const indice = escolhida === null ? -1 : criterio.opcoes.indexOf(escolhida);
    if (indice < minimo) {
      out.push({
        criterio: criterio.rotulo,
        escolhida,
        indicadaPelosDados: criterio.opcoes[minimo]!,
        motivo,
      });
    }
  }
  return out;
}

/** Texto do requisito da aba B para o nível [B - ACOMPANHAMENTO, coluna G]. */
export function requisitosDoNivel(nivel: Nivel | null) {
  return V3_16.requisitos.map((r) => ({
    fase: r.fase,
    requisito: r.requisito,
    exigencia: nivel === null ? null : r.porNivel[nivel - 1],
  }));
}
