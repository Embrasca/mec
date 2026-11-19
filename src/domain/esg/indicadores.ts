/**
 * Os 27 indicadores ESG aprovados, calculados a partir do que foi registrado.
 *
 * Essenciais obrigatórios em todos os níveis (D2), exceto o NPS (PS3), que só
 * entra quando a gestão do evento pede (comentário da revisão).
 */
import {
  ASPECTOS,
  DESTINOS,
  FASES_DE_TRABALHO,
  horasDaEquipe,
  LIDERANCAS,
  MEIOS_DE_TRANSPORTE,
  RECURSOS_DE_ACESSIBILIDADE,
  TIPOS_DE_ACAO,
  VINCULOS,
  type AcaoSocial,
  type Equipe,
  type FornecedorEsg,
  type Material,
  type RegistroEsg,
  type Resposta,
} from "./esquemas";

export const EIXOS_ESG = [
  { id: "ml", nome: "Mão de obra local" },
  { id: "cs", nome: "Cadeia de suprimentos" },
  { id: "rs", nome: "Responsabilidade social" },
  { id: "ps", nome: "Pesquisa de satisfação" },
] as const;
export type EixoEsg = (typeof EIXOS_ESG)[number]["id"];

export interface DefinicaoDoIndicador {
  id: string;
  eixo: EixoEsg;
  nome: string;
  essencial: boolean;
  gri: string | null;
  unidade: string;
}

const def = (
  id: string,
  eixo: EixoEsg,
  nome: string,
  unidade: string,
  gri: string | null = null,
  essencial = false,
): DefinicaoDoIndicador => ({ id, eixo, nome, unidade, gri, essencial });

export const INDICADORES: DefinicaoDoIndicador[] = [
  def("ML1", "ml", "Pessoas trabalhando no evento, por vínculo", "pessoas", "GRI 2-7, 2-8", true),
  def("ML2", "ml", "Mão de obra local", "%", "GRI 202 (referência)", true),
  def("ML3", "ml", "Horas trabalhadas, total e local", "horas"),
  def("ML4", "ml", "Trabalho formalizado", "%", "GRI 2-8"),
  def("ML5", "ml", "Diversidade da equipe", "% de cada grupo", "GRI 405-1"),
  def("ML6", "ml", "Capacitação da equipe", "pessoas e horas", "GRI 404-1"),
  def("ML7", "ml", "Acidentes de trabalho", "ocorrências", "GRI 403-9"),
  def("CS1", "cs", "Fornecedores locais", "%", "GRI 204 (referência)", true),
  def("CS2", "cs", "Gasto com fornecedores locais", "% do valor", "GRI 204-1", true),
  def("CS3", "cs", "Micro e pequenas empresas", "%"),
  def("CS4", "cs", "Negócios liderados por mulheres, pessoas negras ou indígenas", "%"),
  def("CS5", "cs", "Contratos com cláusula socioambiental", "%", "GRI 308-1, 414-1"),
  def("CS6", "cs", "Diligência de fornecedores", "%", "GRI 414-1", true),
  def("CS7", "cs", "Itens com certificação", "itens e R$"),
  def("CS8", "cs", "Destino dos materiais depois do evento", "itens ou kg"),
  def("RS1", "rs", "Ações sociais por tipo", "ações", "GRI 413-1", true),
  def("RS2", "rs", "Pessoas beneficiadas", "pessoas", "GRI 413-1", true),
  def("RS3", "rs", "Doações", "kg e itens"),
  def("RS4", "rs", "Recursos de acessibilidade", "recursos e pessoas"),
  def("RS5", "rs", "Segurança e bem-estar do público", "sim/não e ocorrências"),
  def("PS1", "ps", "Taxa de resposta", "%", null, true),
  def("PS2", "ps", "Satisfação geral", "média e %", null, true),
  def("PS3", "ps", "Recomendação (NPS)", "pontos"),
  def("PS4", "ps", "Avaliação por aspecto", "média por aspecto"),
  def("PS5", "ps", "Percepção das ações de sustentabilidade", "%"),
  def("PS6", "ps", "Como o público chegou", "% por meio e por origem"),
  def("PS7", "ps", "Comentários abertos", "texto"),
];

export const ESSENCIAIS = INDICADORES.filter((i) => i.essencial).map((i) => i.id);

export interface FornecedorComEsg extends FornecedorEsg {
  nome: string;
}

export interface RespostaGravada extends Resposta {
  destaque: boolean;
}

export interface DadosEsg {
  /** Municípios que contam como locais (D1); null sem município do evento. */
  areaLocal: Set<number> | null;
  participantes: number | null;
  equipes: Equipe[];
  fornecedores: FornecedorComEsg[];
  materiais: Material[];
  acoes: AcaoSocial[];
  registro: RegistroEsg;
  respostas: RespostaGravada[];
  npsHabilitado: boolean;
}

export type SituacaoEsg = "ok" | "pendente" | "nao_se_aplica" | "sem_dados";

export interface IndicadorCalculado extends DefinicaoDoIndicador {
  situacao: SituacaoEsg;
  /** Valor principal, já em texto para exibir. */
  valor: string | null;
  /** Detalhes em pares rótulo → valor. */
  detalhes: [string, string][];
  pendencias: string[];
  justificativa: string | null;
  /** Valor numérico, para metas e comparações (percentuais em fração de 0 a 1). */
  numero: number | null;
}

const fmt = (v: number, casas = 1) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(v);
const pct = (num: number, den: number) => (den > 0 ? `${fmt((num / den) * 100)}%` : null);
const soma = (xs: (number | null)[]) => xs.reduce<number>((a, v) => a + (v ?? 0), 0);
const media = (xs: number[]) => (xs.length ? soma(xs) / xs.length : null);
const contar = <T>(xs: T[], p: (x: T) => boolean) => xs.filter(p).length;

/** NPS: % de promotores (9 e 10) menos % de detratores (0 a 6). */
export function nps(notas: number[]): number | null {
  if (notas.length === 0) return null;
  return ((contar(notas, (n) => n >= 9) - contar(notas, (n) => n <= 6)) / notas.length) * 100;
}

export function calcularIndicadores(d: DadosEsg): IndicadorCalculado[] {
  const r: Record<
    string,
    Omit<IndicadorCalculado, keyof DefinicaoDoIndicador | "justificativa" | "numero">
  > = {};
  const ok = (
    valor: string | null,
    detalhes: [string, string][] = [],
    pendencias: string[] = [],
  ) => ({
    situacao: (pendencias.length ? "pendente" : valor === null ? "sem_dados" : "ok") as SituacaoEsg,
    valor,
    detalhes,
    pendencias,
  });

  // --- Mão de obra local
  const eq = d.equipes;
  const pessoas = soma(eq.map((e) => e.pessoas));
  r["ML1"] = ok(
    eq.length ? `${fmt(pessoas, 0)} pessoas` : null,
    [
      ...VINCULOS.map((v): [string, string] => [
        v,
        fmt(soma(eq.filter((e) => e.vinculo === v).map((e) => e.pessoas)), 0),
      ]),
      ...FASES_DE_TRABALHO.map((f): [string, string] => [
        `Na ${f.toLowerCase()}`,
        fmt(soma(eq.filter((e) => e.fase === f).map((e) => e.pessoas)), 0),
      ]),
    ],
    eq.length ? [] : ["Registre as equipes que trabalharam no evento."],
  );
  if (eq.length)
    r["ML1"].detalhes.push([
      "Observação",
      "A mesma pessoa pode aparecer em mais de uma fase; o total soma as fases.",
    ]);
  const semLocais = eq.filter((e) => e.pessoasLocais === null);
  r["ML2"] = ok(
    eq.length && !semLocais.length ? pct(soma(eq.map((e) => e.pessoasLocais)), pessoas) : null,
    [["Pessoas locais", fmt(soma(eq.map((e) => e.pessoasLocais)), 0)]],
    [
      ...(d.areaLocal
        ? []
        : ["Informe o município do evento no cadastro para definir o que é local."]),
      ...(eq.length ? [] : ["Registre as equipes que trabalharam no evento."]),
      ...semLocais.map((e) => `Informe as pessoas locais de “${e.nome}”.`),
    ],
  );
  const horas = eq.map(horasDaEquipe);
  const comHoras = horas.filter((h) => h.total !== null);
  r["ML3"] = ok(
    comHoras.length ? `${fmt(soma(comHoras.map((h) => h.total)), 0)} h` : null,
    comHoras.length
      ? [
          ["Horas de pessoas locais", fmt(soma(comHoras.map((h) => h.locais)), 0)],
          [
            "Parcela local",
            pct(soma(comHoras.map((h) => h.locais)), soma(comHoras.map((h) => h.total))) ?? "—",
          ],
        ]
      : [],
  );
  const parcial = (k: "formalizadas" | "mulheres" | "negras" | "pcd" | "jovens") => {
    const linhas = eq.filter((e) => e[k] !== null);
    return pct(soma(linhas.map((e) => e[k])), soma(linhas.map((e) => e.pessoas)));
  };
  r["ML4"] = ok(parcial("formalizadas"));
  const grupos: [string, "mulheres" | "negras" | "pcd" | "jovens"][] = [
    ["Mulheres", "mulheres"],
    ["Pessoas negras", "negras"],
    ["Pessoas com deficiência", "pcd"],
    ["Jovens até 24 anos", "jovens"],
  ];
  const ml5 = grupos.map(([n, k]): [string, string] => [n, parcial(k) ?? "—"]);
  r["ML5"] = ok(
    ml5.some(([, v]) => v !== "—")
      ? ml5
          .filter(([, v]) => v !== "—")
          .map(([n, v]) => `${n} ${v}`)
          .join(" · ")
      : null,
    ml5,
  );
  const capacitadas = eq.filter((e) => e.capacitadas !== null);
  r["ML6"] = ok(
    capacitadas.length ? `${fmt(soma(capacitadas.map((e) => e.capacitadas)), 0)} pessoas` : null,
    capacitadas.length
      ? [["Horas de capacitação", fmt(soma(eq.map((e) => e.horasCapacitacao)), 0)]]
      : [],
  );
  const acid = eq.filter(
    (e) => e.acidentesComAfastamento !== null || e.acidentesSemAfastamento !== null,
  );
  r["ML7"] = ok(
    acid.length
      ? `${fmt(soma(acid.map((e) => e.acidentesComAfastamento)), 0)} com afastamento · ${fmt(
          soma(acid.map((e) => e.acidentesSemAfastamento)),
          0,
        )} sem afastamento`
      : null,
  );

  // --- Cadeia de suprimentos
  const fs = d.fornecedores;
  const nomes = (xs: FornecedorComEsg[]) => xs.map((f) => `“${f.nome}”`).join(", ");
  const local = (f: FornecedorComEsg) =>
    d.areaLocal !== null && f.municipioIbge !== null && d.areaLocal.has(f.municipioIbge);
  const semMunicipio = fs.filter((f) => f.municipioIbge === null);
  const semFornecedor = fs.length ? [] : ["Cadastre os fornecedores do evento."];
  r["CS1"] = ok(
    fs.length && !semMunicipio.length && d.areaLocal ? pct(contar(fs, local), fs.length) : null,
    [["Fornecedores locais", `${contar(fs, local)} de ${fs.length}`]],
    [
      ...semFornecedor,
      ...(d.areaLocal ? [] : ["Informe o município do evento no cadastro."]),
      ...(semMunicipio.length ? [`Informe o município de ${nomes(semMunicipio)}.`] : []),
    ],
  );
  const semValor = fs.filter((f) => f.valorContratado === null);
  const total$ = soma(fs.map((f) => f.valorContratado));
  const local$ = soma(fs.filter(local).map((f) => f.valorContratado));
  const reais = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  r["CS2"] = ok(
    fs.length && !semValor.length && !semMunicipio.length && d.areaLocal
      ? pct(local$, total$)
      : null,
    [
      ["Valor com fornecedores locais", reais(local$)],
      ["Valor total contratado", reais(total$)],
    ],
    [
      ...semFornecedor,
      ...(semValor.length ? [`Informe o valor contratado de ${nomes(semValor)}.`] : []),
      ...(semMunicipio.length ? [`Informe o município de ${nomes(semMunicipio)}.`] : []),
    ],
  );
  const comPorte = fs.filter((f) => f.porte !== null);
  r["CS3"] = ok(
    comPorte.length
      ? pct(
          contar(comPorte, (f) => f.porte !== "Demais"),
          comPorte.length,
        )
      : null,
  );
  const cs4 = LIDERANCAS.map((l): [string, string] => [
    l,
    pct(
      contar(fs, (f) => f.lideranca.includes(l)),
      fs.length,
    ) ?? "—",
  ]);
  r["CS4"] = ok(
    fs.some((f) => f.lideranca.length) ? cs4.map(([n, v]) => `${n} ${v}`).join(" · ") : null,
    cs4,
  );
  const comClausula = fs.filter((f) => f.clausulaSocioambiental !== null);
  r["CS5"] = ok(
    comClausula.length
      ? pct(
          contar(comClausula, (f) => f.clausulaSocioambiental === true),
          comClausula.length,
        )
      : null,
  );
  const diligente = (f: FornecedorComEsg) =>
    Boolean(f.consultaTrabalhoEscravo && f.consultaIbama && f.consultaRegularidade);
  const semDiligencia = fs.filter((f) => !diligente(f));
  r["CS6"] = ok(
    fs.length && !semDiligencia.length ? pct(contar(fs, diligente), fs.length) : null,
    [["Fornecedores com as três consultas", `${contar(fs, diligente)} de ${fs.length}`]],
    [
      ...semFornecedor,
      ...(semDiligencia.length
        ? [
            `Registre as consultas (trabalho escravo, IBAMA e regularidade fiscal) de ${nomes(semDiligencia)}.`,
          ]
        : []),
    ],
  );
  const certificados = fs.filter((f) => f.certificacoes);
  r["CS7"] = ok(
    certificados.length ? `${certificados.length} fornecedor(es) com itens certificados` : null,
    [
      ...certificados.map((f): [string, string] => [f.nome, f.certificacoes!]),
      ...(certificados.length
        ? [
            ["Valor certificado", reais(soma(certificados.map((f) => f.valorCertificado)))] as [
              string,
              string,
            ],
          ]
        : []),
    ],
  );
  const m = d.materiais;
  const porDestino = DESTINOS.map((dest): [string, string] => {
    const xs = m.filter((x) => x.destino === dest);
    const unidades = [...new Set(xs.map((x) => x.unidade))];
    return [
      dest,
      unidades.length
        ? unidades
            .map(
              (u) =>
                `${fmt(soma(xs.filter((x) => x.unidade === u).map((x) => x.quantidade)))} ${u}`,
            )
            .join(" + ")
        : "—",
    ];
  });
  r["CS8"] = ok(m.length ? `${m.length} registro(s)` : null, porDestino);

  // --- Responsabilidade social
  const a = d.acoes;
  r["RS1"] = ok(
    a.length ? `${a.length} ação(ões)` : null,
    TIPOS_DE_ACAO.map((t): [string, string] => [t, String(contar(a, (x) => x.tipo === t))]),
    a.length ? [] : ["Registre as ações sociais do evento."],
  );
  const semPessoas = a.filter((x) => x.pessoasBeneficiadas === null);
  r["RS2"] = ok(
    a.length && !semPessoas.length
      ? `${fmt(soma(a.map((x) => x.pessoasBeneficiadas)), 0)} pessoas`
      : null,
    [],
    [
      ...(a.length ? [] : ["Registre as ações sociais do evento."]),
      ...semPessoas.map((x) => `Informe as pessoas beneficiadas em “${x.descricao}”.`),
    ],
  );
  const kg = soma(a.map((x) => x.alimentosKg));
  const itens = soma(a.map((x) => x.itensDoados));
  r["RS3"] = ok(
    a.some((x) => x.alimentosKg !== null || x.itensDoados !== null)
      ? `${fmt(kg)} kg de alimentos · ${fmt(itens, 0)} itens`
      : null,
    a
      .filter((x) => x.instituicaoReceptora)
      .map((x): [string, string] => [x.instituicaoReceptora!, x.descricao]),
  );
  const acess = d.registro.acessibilidade;
  const oferecidos = RECURSOS_DE_ACESSIBILIDADE.filter((k) => acess[k]?.oferecido);
  r["RS4"] = ok(
    Object.keys(acess).length
      ? `${oferecidos.length} de ${RECURSOS_DE_ACESSIBILIDADE.length} recursos`
      : null,
    RECURSOS_DE_ACESSIBILIDADE.map((k): [string, string] => [
      k,
      k === "Piso tátil" && d.registro.pisoTatilViavel === false
        ? "Estrutura não comporta"
        : acess[k]?.oferecido
          ? `Sim${acess[k]?.pessoas !== null && acess[k]?.pessoas !== undefined ? ` · ${fmt(acess[k]!.pessoas!, 0)} pessoas` : ""}`
          : acess[k]?.oferecido === false
            ? "Não"
            : "—",
    ]),
  );
  const b = d.registro.bemEstar;
  const sn = (v: boolean | null) => (v === null ? "—" : v ? "Sim" : "Não");
  r["RS5"] = ok(
    [b.protocoloAssedio, b.atendimentoSaude, b.aguaGratuita].some((v) => v !== null)
      ? `${contar([b.protocoloAssedio, b.atendimentoSaude, b.aguaGratuita], (v) => v === true)} de 3 cuidados`
      : null,
    [
      ["Protocolo contra assédio", sn(b.protocoloAssedio)],
      ["Atendimento de saúde", sn(b.atendimentoSaude)],
      ["Água gratuita", sn(b.aguaGratuita)],
      [
        "Atendimentos de saúde",
        b.atendimentosDeSaude === null ? "—" : fmt(b.atendimentosDeSaude, 0),
      ],
      ["Casos registrados", b.casosRegistrados === null ? "—" : fmt(b.casosRegistrados, 0)],
    ],
  );

  // --- Pesquisa de satisfação
  const rs = d.respostas;
  r["PS1"] = ok(
    rs.length && d.participantes ? pct(rs.length, d.participantes) : null,
    [["Respostas", fmt(rs.length, 0)]],
    [
      ...(rs.length ? [] : ["Aplique a pesquisa ou importe as respostas."]),
      ...(d.participantes ? [] : ["Informe o total de participantes na caracterização."]),
    ],
  );
  const sat = rs.map((x) => x.satisfacao);
  r["PS2"] = ok(
    rs.length ? `${fmt(media(sat)!, 2)} de 5` : null,
    rs.length
      ? [
          [
            "Satisfeitos (notas 4 e 5)",
            pct(
              contar(sat, (n) => n >= 4),
              sat.length,
            )!,
          ],
        ]
      : [],
    rs.length ? [] : ["Aplique a pesquisa ou importe as respostas."],
  );
  const notasNps = rs.map((x) => x.nps).filter((n): n is number => n !== null);
  r["PS3"] = d.npsHabilitado
    ? ok(notasNps.length ? fmt(nps(notasNps)!, 0) : null, [
        ["Respostas com nota", fmt(notasNps.length, 0)],
      ])
    : {
        situacao: "nao_se_aplica",
        valor: null,
        detalhes: [["NPS", "Não solicitado pela gestão do evento"]],
        pendencias: [],
      };
  const ps4 = ASPECTOS.map(([k, nome]): [string, string] => {
    const v = media(rs.map((x) => x[k]).filter((n): n is number => n !== null));
    return [nome, v === null ? "—" : fmt(v, 2)];
  });
  r["PS4"] = ok(ps4.some(([, v]) => v !== "—") ? "por aspecto" : null, ps4);
  const notou = rs.filter((x) => x.notouSustentabilidade !== null);
  r["PS5"] = ok(
    notou.length
      ? pct(
          contar(notou, (x) => x.notouSustentabilidade === true),
          notou.length,
        )
      : null,
  );
  const comMeio = rs.filter((x) => x.meioTransporte !== null);
  r["PS6"] = ok(
    comMeio.length ? `${comMeio.length} resposta(s)` : null,
    MEIOS_DE_TRANSPORTE.map((mt): [string, string] => [
      mt,
      pct(
        contar(comMeio, (x) => x.meioTransporte === mt),
        comMeio.length,
      ) ?? "—",
    ]),
  );
  const comentarios = rs.filter((x) => x.comentario);
  r["PS7"] = ok(
    comentarios.length
      ? `${comentarios.length} comentário(s), ${contar(comentarios, (x) => x.destaque)} em destaque`
      : null,
  );

  const numeros: Record<string, number | null> = {
    ML2: pessoas > 0 ? soma(eq.map((e) => e.pessoasLocais)) / pessoas : null,
    CS1: fs.length ? contar(fs, local) / fs.length : null,
    CS2: total$ > 0 ? local$ / total$ : null,
    CS6: fs.length ? contar(fs, diligente) / fs.length : null,
    PS1: rs.length && d.participantes ? rs.length / d.participantes : null,
    PS2: media(sat),
    PS3: d.npsHabilitado ? nps(notasNps) : null,
  };
  return INDICADORES.map((i) => {
    const calc = r[i.id]!;
    const numero = calc.situacao === "ok" ? (numeros[i.id] ?? null) : null;
    const nsa = d.registro.naoSeAplica[i.id];
    if (nsa && calc.situacao !== "ok")
      return {
        ...i,
        ...calc,
        situacao: "nao_se_aplica",
        pendencias: [],
        justificativa: nsa.justificativa,
        numero: null,
      };
    return {
      ...i,
      ...calc,
      // Só os essenciais geram pendência; nos demais, o que falta é apenas informativo.
      situacao: !i.essencial && calc.situacao === "pendente" ? "sem_dados" : calc.situacao,
      pendencias: i.essencial ? calc.pendencias : [],
      justificativa: null,
      numero,
    };
  });
}

/** Pendências dos indicadores essenciais (D2: obrigatórios em todos os níveis). */
export function pendenciasEssenciais(indicadores: IndicadorCalculado[]) {
  return indicadores
    .filter((i) => i.essencial && (i.situacao === "pendente" || i.situacao === "sem_dados"))
    .map((i) => ({
      id: i.id,
      nome: i.nome,
      pendencias: i.pendencias.length ? i.pendencias : ["Sem dados registrados."],
    }));
}
