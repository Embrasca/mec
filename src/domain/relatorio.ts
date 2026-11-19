/**
 * Relatório do evento: o conteúdo congelado em cada versão e as tabelas de
 * correspondência com os frameworks escolhidos (GHG Protocol, GRI, ISO 20121).
 *
 * A correspondência só aponta onde, no relatório, cada requisito é tratado, e
 * diz com franqueza o que o sistema ainda não cobre. Nenhum dado é inventado.
 */
import type { DadosDePublico } from "./metodologia/posEvento";
import type {
  calcularComparacao,
  calcularCompensacao,
  calcularResultados,
  Compensacao,
  Ocorrencia,
} from "./metodologia/posEvento";
import type { LinhaDaMemoria } from "./metodologia/relatorio";

export const FRAMEWORKS = ["GRI + ISO 20121", "GRI", "ISO 20121", "GHG Protocol"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const TIPOS_DE_RELATORIO = ["preliminar", "final"] as const;
export type TipoDeRelatorio = (typeof TIPOS_DE_RELATORIO)[number];

export interface DadosDoRelatorio {
  modelo: 1;
  metodologia: string;
  evento: {
    nome: string;
    instituicao: string;
    cidade: string;
    uf: string;
    dataInicio: string;
    dataFim: string;
    nivel: number | null;
    designacao: string | null;
    responsavel: string | null;
    alegacaoPretendida: string | null;
  };
  base: {
    nome: string;
    referenciaGwp: string;
    gwpCh4: number;
    gwpN2o: number;
    ano: number;
    avisoSin: string | null;
  };
  publico: DadosDePublico;
  exAnte: { fechadoEm: string | null; total: number } | null;
  exPost: { fechadoEm: string | null; pendencias: number };
  resultados: ReturnType<typeof calcularResultados>;
  comparacao: ReturnType<typeof calcularComparacao> | null;
  compensacao: Compensacao & ReturnType<typeof calcularCompensacao>;
  frase: string;
  avisoAlegacao: string | null;
  memoria: LinhaDaMemoria[];
  reducao: {
    exigencia: string;
    conferencia: string | null;
    medidas: {
      categoria: string | null;
      acao: string | null;
      objetivo: string | null;
      metaPct: number | null;
      metaT: number | null;
      responsavel: string | null;
      prazo: string | null;
      resultado: string | null;
      evidencia: string | null;
    }[];
  };
  temas: {
    tema: string;
    categoria: string | null;
    impacto: number;
    relevancia: number;
    prioridade: string;
    stakeholders: string | null;
  }[];
  acoes: {
    acao: string;
    responsavel: string | null;
    prazo: string | null;
    situacao: string;
    progresso: number;
  }[];
  ocorrencias: Ocorrencia[];
  fornecedores: { total: number; recebidos: number };
  checklist: { nome: string; itens: number; progresso: number; concluida: boolean }[];
}

export type Situacao = "atendido" | "parcial" | "nao_coberto";

export interface ItemDeCorrespondencia {
  codigo: string;
  requisito: string;
  secao: string;
  situacao: Situacao;
  observacao: string;
}

export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  atendido: "Atendido",
  parcial: "Parcial",
  nao_coberto: "Não coberto nesta versão",
};

/** Seções do relatório, na ordem em que aparecem. */
export const SECOES = {
  evento: "1. O evento e o nível",
  emissoes: "2. Emissões do evento",
  qualidade: "3. Qualidade do inventário",
  comparacao: "4. Previsto e realizado",
  reducao: "5. Redução e gestão",
  compensacao: "6. Compensação e frase permitida",
  ocorrencias: "7. Ocorrências",
  memoria: "8. Memória de cálculo",
} as const;

const t3 = (v: number | undefined) =>
  v === undefined ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(v);

const semDados = (d: DadosDoRelatorio) =>
  d.resultados.completude.filter((c) => c.linhas === 0).map((c) => c.categoria);

function ghgProtocol(d: DadosDoRelatorio): ItemDeCorrespondencia[] {
  const vazias = semDados(d);
  const [e1, e2, e3] = d.resultados.escopos;
  return [
    {
      codigo: "Limites",
      requisito: "Limite do inventário e período",
      secao: SECOES.evento,
      situacao: "atendido",
      observacao: "O evento e as datas de início e término.",
    },
    {
      codigo: "Escopo 1",
      requisito: "Emissões diretas de fontes próprias ou controladas",
      secao: SECOES.emissoes,
      situacao: "atendido",
      observacao: `${t3(e1?.valor)} tCO₂e.`,
    },
    {
      codigo: "Escopo 2",
      requisito: "Emissões da energia elétrica adquirida",
      secao: SECOES.emissoes,
      situacao: "atendido",
      observacao: `${t3(e2?.valor)} tCO₂e, pelo fator médio do Sistema Interligado Nacional (abordagem por localização).`,
    },
    {
      codigo: "Escopo 3",
      requisito: "Demais emissões da cadeia, com as categorias incluídas",
      secao: SECOES.emissoes,
      situacao: vazias.length ? "parcial" : "atendido",
      observacao: `${t3(e3?.valor)} tCO₂e.${
        vazias.length ? ` Sem dados: ${vazias.join(", ")}. Confirme se não se aplicam.` : ""
      }`,
    },
    {
      codigo: "Gases",
      requisito: "Emissões por gás e potencial de aquecimento global",
      secao: SECOES.emissoes,
      situacao: "atendido",
      observacao: `CO₂, CH₄ e N₂O, com GWP ${d.base.referenciaGwp}.`,
    },
    {
      codigo: "CO₂ biogênico",
      requisito: "CO₂ biogênico informado fora dos escopos",
      secao: SECOES.emissoes,
      situacao: "atendido",
      observacao: "Informado à parte e fora do total.",
    },
    {
      codigo: "Fatores",
      requisito: "Fonte dos fatores de emissão e metodologia",
      secao: SECOES.memoria,
      situacao: "atendido",
      observacao: `${d.base.nome}; metodologia ${d.metodologia}. Cada linha traz a conta e a fonte do fator.`,
    },
    {
      codigo: "Exclusões",
      requisito: "Fontes excluídas e justificativa",
      secao: SECOES.qualidade,
      situacao: vazias.length ? "parcial" : "atendido",
      observacao: vazias.length
        ? "A completude por categoria lista as categorias sem dados; a justificativa deve ser escrita no texto do relatório."
        : "Todas as categorias têm dados.",
    },
    {
      codigo: "Qualidade",
      requisito: "Qualidade dos dados e incertezas",
      secao: SECOES.qualidade,
      situacao: "atendido",
      observacao: "Parcela com dado primário, nota média e parcela estimada.",
    },
    {
      codigo: "Compensação",
      requisito: "Compensações informadas à parte das emissões",
      secao: SECOES.compensacao,
      situacao: "atendido",
      observacao: "A quantidade aposentada aparece separada das emissões brutas.",
    },
  ];
}

function gri(d: DadosDoRelatorio): ItemDeCorrespondencia[] {
  const altas = d.temas.filter((t) => t.prioridade === "alta");
  const desempenho = d.comparacao?.categorias.filter(
    (c) => c.origem === "Desempenho" && c.diferenca < 0,
  );
  return [
    {
      codigo: "GRI 3-1",
      requisito: "Processo para determinar temas materiais",
      secao: SECOES.reducao,
      situacao: d.temas.length ? "atendido" : "nao_coberto",
      observacao: d.temas.length
        ? "Matriz impacto × relevância, com partes interessadas e fonte."
        : "A matriz impacto × relevância do evento está vazia.",
    },
    {
      codigo: "GRI 3-2",
      requisito: "Lista de temas materiais",
      secao: SECOES.reducao,
      situacao: altas.length ? "atendido" : d.temas.length ? "parcial" : "nao_coberto",
      observacao: altas.length
        ? altas.map((t) => t.tema).join("; ")
        : "Nenhum tema com prioridade alta na matriz.",
    },
    {
      codigo: "GRI 3-3",
      requisito: "Gestão dos temas materiais",
      secao: SECOES.reducao,
      situacao: d.acoes.length || d.reducao.medidas.length ? "atendido" : "nao_coberto",
      observacao: `${d.reducao.medidas.length} medida(s) de redução e ${d.acoes.length} ação(ões) no plano.`,
    },
    {
      codigo: "GRI 305-1",
      requisito: "Emissões diretas (Escopo 1)",
      secao: SECOES.emissoes,
      situacao: "atendido",
      observacao: "Com gases incluídos, GWP, fonte dos fatores e CO₂ biogênico à parte.",
    },
    {
      codigo: "GRI 305-2",
      requisito: "Emissões indiretas de energia (Escopo 2)",
      secao: SECOES.emissoes,
      situacao: "parcial",
      observacao:
        "Só pela abordagem por localização (fator médio do SIN). A abordagem por escolha de compra não é calculada.",
    },
    {
      codigo: "GRI 305-3",
      requisito: "Outras emissões indiretas (Escopo 3)",
      secao: SECOES.emissoes,
      situacao: "atendido",
      observacao: "Por categoria da Ferramenta.",
    },
    {
      codigo: "GRI 305-4",
      requisito: "Intensidade de emissões",
      secao: SECOES.emissoes,
      situacao:
        d.resultados.principais.porParticipante !== null ||
        d.resultados.principais.porParticipanteDia !== null
          ? "atendido"
          : "nao_coberto",
      observacao: "Por participante e por participante-dia.",
    },
    {
      codigo: "GRI 305-5",
      requisito: "Redução de emissões",
      secao: SECOES.comparacao,
      situacao: desempenho?.length ? "atendido" : "parcial",
      observacao: desempenho?.length
        ? `Diferenças classificadas como desempenho: ${desempenho.map((c) => c.categoria).join(", ")}.`
        : 'Só as diferenças com origem "Desempenho" podem ser comunicadas como redução; nenhuma foi classificada assim.',
    },
    {
      codigo: "GRI 305-6 e 305-7",
      requisito: "Substâncias que destroem a camada de ozônio; NOx, SOx e outras",
      secao: "—",
      situacao: "nao_coberto",
      observacao: "A Ferramenta não calcula.",
    },
    {
      codigo: "Outros temas GRI",
      requisito: "Resíduos, água, social, cadeia de suprimentos",
      secao: "—",
      situacao: "nao_coberto",
      observacao: "Previstos para os módulos de ESG além do GEE.",
    },
  ];
}

function iso20121(d: DadosDoRelatorio): ItemDeCorrespondencia[] {
  const comPartes = d.temas.filter((t) => t.stakeholders).length;
  return [
    {
      codigo: "Cap. 4",
      requisito: "Contexto: questões de sustentabilidade e partes interessadas",
      secao: SECOES.reducao,
      situacao: d.temas.length ? (comPartes ? "atendido" : "parcial") : "nao_coberto",
      observacao: d.temas.length
        ? `${d.temas.length} tema(s) na matriz, ${comPartes} com partes interessadas indicadas.`
        : "A matriz impacto × relevância está vazia.",
    },
    {
      codigo: "Cap. 5",
      requisito: "Liderança: política e responsabilidades",
      secao: SECOES.evento,
      situacao: d.evento.responsavel ? "parcial" : "nao_coberto",
      observacao: d.evento.responsavel
        ? `Responsável pela gestão climática: ${d.evento.responsavel}. A política de sustentabilidade não é registrada no sistema.`
        : "A política de sustentabilidade não é registrada no sistema.",
    },
    {
      codigo: "Cap. 6",
      requisito: "Planejamento: objetivos e planos para alcançá-los",
      secao: SECOES.reducao,
      situacao: d.reducao.medidas.length || d.acoes.length ? "atendido" : "nao_coberto",
      observacao: `Plano de redução (${d.reducao.conferencia ?? "sem conferência"}) e plano de ação.`,
    },
    {
      codigo: "Cap. 7",
      requisito: "Apoio: recursos, competência, comunicação e documentos",
      secao: "—",
      situacao: "nao_coberto",
      observacao: "Fora do escopo do sistema.",
    },
    {
      codigo: "Cap. 8",
      requisito: "Operação: controle operacional e cadeia de suprimentos",
      secao: SECOES.reducao,
      situacao: d.fornecedores.total ? "atendido" : "parcial",
      observacao: `Checklist do nível por fase e ${d.fornecedores.recebidos} de ${d.fornecedores.total} fornecedor(es) com dados recebidos.`,
    },
    {
      codigo: "Cap. 9",
      requisito: "Avaliação de desempenho: monitoramento, medição e análise",
      secao: SECOES.qualidade,
      situacao: "parcial",
      observacao:
        "Inventário, resultados, qualidade e comparação com o previsto. Auditoria interna e análise crítica pela direção não são registradas no sistema.",
    },
    {
      codigo: "Cap. 10",
      requisito: "Melhoria: não conformidades e ação corretiva",
      secao: SECOES.ocorrencias,
      situacao: d.ocorrencias.length ? "atendido" : "parcial",
      observacao: `${d.ocorrencias.length} ocorrência(s) com ação adotada; desvios de premissa ficam como lição para as próximas edições.`,
    },
  ];
}

export function correspondencia(framework: Framework, d: DadosDoRelatorio) {
  const tabelas: { titulo: string; itens: ItemDeCorrespondencia[] }[] = [
    { titulo: "GHG Protocol", itens: ghgProtocol(d) },
  ];
  if (framework === "GRI" || framework === "GRI + ISO 20121")
    tabelas.push({ titulo: "GRI (GRI 3 e GRI 305)", itens: gri(d) });
  if (framework === "ISO 20121" || framework === "GRI + ISO 20121")
    tabelas.push({ titulo: "ISO 20121", itens: iso20121(d) });
  return tabelas;
}
