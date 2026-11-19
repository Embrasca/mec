/** Monta as abas do XLSX de uma versão do relatório. */
import {
  correspondencia,
  NOME_DA_SITUACAO,
  type DadosDoRelatorio,
  type Framework,
} from "@/domain/relatorio";
import type { Aba } from "./xlsx";

export interface CabecalhoDoRelatorio {
  numero: number;
  tipo: string;
  framework: Framework;
  geradoEm: string;
  geradoPor: string;
  hash: string;
}

export function abasDoRelatorio(d: DadosDoRelatorio, c: CabecalhoDoRelatorio): Aba[] {
  const r = d.resultados;
  const p = r.principais;
  const e = d.evento;
  const resumo: Aba = {
    nome: "Resumo",
    larguras: [48, 70],
    linhas: [
      ["Campo", "Valor"],
      ["Relatório", `Versão ${c.numero} (${c.tipo}) · ${c.framework}`],
      ["Gerado em", c.geradoEm],
      ["Gerado por", c.geradoPor],
      ["Código de integridade (SHA-256)", c.hash],
      ["Metodologia", d.metodologia],
      ["Nome do evento", e.nome],
      ["Instituição", e.instituicao],
      ["Local", `${e.cidade}/${e.uf}`],
      ["Período", `${e.dataInicio} a ${e.dataFim}`],
      ["Ano do inventário", d.base.ano],
      ["Nível do evento", e.designacao ?? "—"],
      ["Responsável pela gestão climática", e.responsavel],
      ["Participantes", d.publico.participantes],
      ["EMISSÕES BRUTAS DO EVENTO (tCO₂e)", p.total],
      ["Escopo 1 (tCO₂e)", r.escopos[0]?.valor],
      ["Escopo 2 (tCO₂e)", r.escopos[1]?.valor],
      ["Escopo 3 (tCO₂e)", r.escopos[2]?.valor],
      ["Emissões por participante (kgCO₂e)", p.porParticipante],
      ["Emissões por participante-dia (kgCO₂e)", p.porParticipanteDia],
      ["CO₂ biogênico informado à parte (t)", p.biogenico],
      ["Emissões residuais (tCO₂e)", d.compensacao.residuais],
      ["Quantidade compensada e aposentada (tCO₂e)", d.compensacao.aposentadaT ?? 0],
      ["Saldo não compensado (tCO₂e)", d.compensacao.saldo],
      ["Emissões com dado primário", r.qualidade.primario],
      ["Nota média de qualidade", r.qualidade.notaMedia],
      ["Fonte dos fatores de emissão", d.base.nome],
      ["Referência de GWP", d.base.referenciaGwp],
      ["FRASE QUE VOCÊ PODE USAR", d.frase],
      ["Aviso sobre a alegação pretendida", d.avisoAlegacao],
    ],
  };
  const categorias: Aba = {
    nome: "Categorias",
    larguras: [26, 16, 16, 12, 12, 16, 12],
    linhas: [
      [
        "Categoria",
        "Ex-ante (tCO₂e)",
        "Ex-post (tCO₂e)",
        "% do total",
        "Variação",
        "Material (≥ 5%)",
        "Prioritária",
      ],
      ...r.categorias.map((x) => [
        x.categoria,
        x.exAnte,
        x.exPost,
        x.participacao,
        x.variacao,
        x.material ? "SIM - material" : "",
        x.prioritaria ? "Sim" : "",
      ]),
    ],
  };
  const memoria: Aba = {
    nome: "Memória de cálculo",
    larguras: [
      5, 34, 20, 18, 22, 7, 12, 10, 12, 12, 12, 12, 12, 12, 12, 12, 60, 40, 24, 24, 30, 30,
    ],
    linhas: [
      [
        "Nº",
        "Item",
        "Descrição",
        "Fornecedor",
        "Categoria",
        "Escopo",
        "Quantidade",
        "Unidade",
        "FE CO₂",
        "FE CH₄",
        "FE N₂O",
        "tCO₂e de CO₂",
        "tCO₂e de CH₄",
        "tCO₂e de N₂O",
        "TOTAL tCO₂e",
        "CO₂ biogênico (t)",
        "Conta",
        "Fonte do fator",
        "Qualidade do dado",
        "Evidência",
        "Premissa / observação",
        "Alerta",
      ],
      ...d.memoria.map((m) => [
        m.ordem,
        m.item,
        m.descricao,
        m.fornecedor,
        m.categoria,
        m.escopo,
        m.quantidade,
        m.unidade,
        m.feCo2,
        m.feCh4,
        m.feN2o,
        m.tco2eCo2,
        m.tco2eCh4,
        m.tco2eN2o,
        m.total,
        m.biogenico,
        m.formula,
        m.fonteDoFator,
        m.qualidade,
        m.evidencia,
        m.premissa,
        m.alerta,
      ]),
      [],
      [`GWP CH₄ = ${d.base.gwpCh4}; GWP N₂O = ${d.base.gwpN2o} (${d.base.referenciaGwp}).`],
      ...(d.base.avisoSin ? [[d.base.avisoSin]] : []),
    ],
  };
  const comparacao: Aba = {
    nome: "Comparação",
    larguras: [26, 16, 16, 16, 12, 22, 60],
    linhas: [
      [
        "Categoria",
        "Ex-ante (tCO₂e)",
        "Ex-post (tCO₂e)",
        "Diferença (tCO₂e)",
        "Diferença (%)",
        "Origem do desvio",
        "Explicação",
      ],
      ...(d.comparacao?.categorias.map((x) => [
        x.categoria,
        x.exAnte,
        x.exPost,
        x.diferenca,
        x.pct,
        x.origem,
        x.explicacao,
      ]) ?? []),
    ],
  };
  const reducao: Aba = {
    nome: "Redução",
    larguras: [24, 50, 12, 10, 12, 26, 12, 14, 30],
    linhas: [
      [
        "Categoria",
        "Medida",
        "Objetivo",
        "Meta (%)",
        "Meta (tCO₂e)",
        "Responsável",
        "Prazo",
        "Resultado",
        "Evidência",
      ],
      ...d.reducao.medidas.map((m) => [
        m.categoria,
        m.acao,
        m.objetivo,
        m.metaPct,
        m.metaT,
        m.responsavel,
        m.prazo,
        m.resultado,
        m.evidencia,
      ]),
    ],
  };
  const ocorrencias: Aba = {
    nome: "Ocorrências",
    larguras: [12, 12, 22, 50, 30, 40, 24, 14, 50],
    linhas: [
      [
        "Data",
        "Fase",
        "Categoria",
        "Ocorrência",
        "Impacto nos dados",
        "Ação adotada",
        "Responsável",
        "Situação",
        "Premissa ou método alternativo",
      ],
      ...d.ocorrencias.map((o) => [
        o.data,
        o.fase,
        o.categoria,
        o.ocorrencia,
        o.impacto,
        o.acao,
        o.responsavel,
        o.situacao,
        o.premissa,
      ]),
    ],
  };
  const indice: Aba = {
    nome: "Correspondência",
    larguras: [24, 22, 50, 34, 24, 70],
    linhas: [
      ["Framework", "Código", "Requisito", "Seção do relatório", "Situação", "Observação"],
      ...correspondencia(c.framework, d).flatMap((t) =>
        t.itens.map((i) => [
          t.titulo,
          i.codigo,
          i.requisito,
          i.secao,
          NOME_DA_SITUACAO[i.situacao],
          i.observacao,
        ]),
      ),
    ],
  };
  return [resumo, categorias, memoria, comparacao, reducao, ocorrencias, indice];
}
