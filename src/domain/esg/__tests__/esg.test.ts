import { describe, expect, it } from "vitest";
import {
  acharMunicipio,
  areaLocal,
  eventoComMunicipioSchema as eventoSchema,
  municipio,
} from "../../territorio";
import {
  equipeSchema,
  equipeVazia,
  fornecedorEsgVazio,
  horasDaEquipe,
  registroEsgVazio,
  type Resposta,
} from "../esquemas";
import { importarRespostas, lerCsv, MODELO_CSV } from "../importacao";
import {
  calcularIndicadores,
  ESSENCIAIS,
  INDICADORES,
  nps,
  pendenciasEssenciais,
  type DadosEsg,
} from "../indicadores";

const GOIANIA = 5208707;
const APARECIDA = 5201405; // Aparecida de Goiânia, na RM de Goiânia
const ANAPOLIS = 5201108; // fora da RM de Goiânia
const PALMAS = 1721000;

describe("território e área local (D1)", () => {
  it("município em região metropolitana: o município e toda a RM", () => {
    const a = areaLocal(GOIANIA)!;
    expect(a.criterio).toBe("regiao_metropolitana");
    expect(a.regioes.join()).toMatch(/Goiânia/);
    expect(a.municipios.has(GOIANIA)).toBe(true);
    expect(a.municipios.has(APARECIDA)).toBe(true);
    expect(a.municipios.has(ANAPOLIS)).toBe(false);
  });

  it("Brasília entra pela RIDE do Distrito Federal", () => {
    const a = areaLocal(5300108)!;
    expect(a.regioes.join()).toMatch(/Distrito Federal/);
    expect(a.municipios.size).toBeGreaterThan(1);
  });

  it("fora de região metropolitana, vale a região imediata", () => {
    const capitalSemRm = [PALMAS].map((id) => areaLocal(id)!);
    for (const a of capitalSemRm) expect(a.municipios.size).toBeGreaterThan(0);
    expect(areaLocal(1)).toBeNull();
  });

  it("acha município pelo nome, sem acento", () => {
    expect(acharMunicipio("goiania", "GO")?.id).toBe(GOIANIA);
    expect(acharMunicipio("Goiânia", "SP")).toBeUndefined();
    expect(municipio(GOIANIA)?.nome).toBe("Goiânia");
  });

  it("cadastro do evento: código IBGE confere com a UF; sem código, procura pelo nome", () => {
    const base = {
      nome: "E",
      instituicao: "I",
      cidade: "",
      uf: "GO" as const,
      dataInicio: "2026-01-01",
      dataFim: "2026-01-02",
      cor: "#1e6f5c",
      descricao: null,
    };
    expect(eventoSchema.parse({ ...base, municipioIbge: GOIANIA })).toMatchObject({
      cidade: "Goiânia",
    });
    expect(
      eventoSchema.parse({ ...base, cidade: "goiânia", municipioIbge: null }).municipioIbge,
    ).toBe(GOIANIA);
    expect(eventoSchema.safeParse({ ...base, municipioIbge: PALMAS }).success).toBe(false);
    expect(
      eventoSchema.safeParse({ ...base, cidade: "Cidade inventada", municipioIbge: null }).success,
    ).toBe(false);
  });
});

const resposta = (r: Partial<Resposta>): Resposta & { destaque: boolean } => ({
  satisfacao: 5,
  nps: null,
  organizacao: null,
  conteudo: null,
  alimentacao: null,
  acessibilidade: null,
  sustentabilidade: null,
  notouSustentabilidade: null,
  meioTransporte: null,
  municipioOrigem: null,
  comentario: null,
  destaque: false,
  ...r,
});

const vazio = (): DadosEsg => ({
  areaLocal: areaLocal(GOIANIA)!.municipios,
  participantes: 200,
  equipes: [],
  fornecedores: [],
  materiais: [],
  acoes: [],
  registro: registroEsgVazio(),
  respostas: [],
  npsHabilitado: false,
});

describe("indicadores", () => {
  it("27 indicadores; essenciais aprovados, sem o NPS", () => {
    expect(INDICADORES).toHaveLength(27);
    expect(ESSENCIAIS).toEqual(["ML1", "ML2", "CS1", "CS2", "CS6", "RS1", "RS2", "PS1", "PS2"]);
  });

  it("evento sem registros: todos os essenciais pendentes", () => {
    const p = pendenciasEssenciais(calcularIndicadores(vazio()));
    expect(p.map((x) => x.id)).toEqual(ESSENCIAIS);
  });

  it("mão de obra: % local, horas pelas duas maneiras e diversidade em totais", () => {
    const d = vazio();
    d.equipes = [
      {
        ...equipeVazia(),
        nome: "Montagem",
        pessoas: 40,
        pessoasLocais: 30,
        modoHoras: "Pessoas × horas médias",
        horasPorPessoa: 8,
        mulheres: 10,
      },
      {
        ...equipeVazia(),
        nome: "Limpeza",
        pessoas: 10,
        pessoasLocais: 10,
        modoHoras: "Total da escala",
        horasTotais: 120,
        horasLocais: 120,
      },
    ];
    const i = Object.fromEntries(calcularIndicadores(d).map((x) => [x.id, x]));
    expect(i["ML1"]!.valor).toBe("50 pessoas");
    expect(i["ML2"]!.valor).toBe("80%");
    expect(i["ML2"]!.situacao).toBe("ok");
    expect(i["ML3"]!.valor).toBe("440 h");
    expect(i["ML3"]!.detalhes[0]).toEqual(["Horas de pessoas locais", "360"]);
    expect(i["ML5"]!.detalhes[0]).toEqual(["Mulheres", "25%"]);
    expect(horasDaEquipe(d.equipes[0]!)).toEqual({ total: 320, locais: 240 });
  });

  it("validação da equipe: subgrupo não passa do total", () => {
    expect(
      equipeSchema.safeParse({ ...equipeVazia(), nome: "x", pessoas: 5, pessoasLocais: 6 }).success,
    ).toBe(false);
  });

  it("fornecedores: local pela RM, gasto local e diligência completa", () => {
    const d = vazio();
    const f = (nome: string, municipioIbge: number, valor: number, completo: boolean) => ({
      ...fornecedorEsgVazio(),
      nome,
      municipioIbge,
      valorContratado: valor,
      consultaTrabalhoEscravo: "2026-08-01",
      consultaIbama: "2026-08-01",
      consultaRegularidade: completo ? "2026-08-01" : null,
    });
    d.fornecedores = [f("Buffet", APARECIDA, 30000, true), f("Gráfica", ANAPOLIS, 10000, false)];
    const i = Object.fromEntries(calcularIndicadores(d).map((x) => [x.id, x]));
    expect(i["CS1"]!.valor).toBe("50%");
    expect(i["CS2"]!.valor).toBe("75%");
    expect(i["CS6"]!.situacao).toBe("pendente");
    expect(i["CS6"]!.pendencias[0]).toMatch(/Gráfica/);
  });

  it("não se aplica, com justificativa, tira a pendência", () => {
    const d = vazio();
    d.registro.naoSeAplica = { RS1: { justificativa: "Evento interno sem ações sociais" } };
    const rs1 = calcularIndicadores(d).find((x) => x.id === "RS1")!;
    expect(rs1.situacao).toBe("nao_se_aplica");
    expect(pendenciasEssenciais(calcularIndicadores(d)).map((x) => x.id)).not.toContain("RS1");
  });

  it("pesquisa: taxa de resposta, satisfação e NPS só quando a gestão pede", () => {
    const d = vazio();
    d.respostas = [
      resposta({ satisfacao: 5, nps: 10 }),
      resposta({ satisfacao: 3, nps: 6 }),
      resposta({ satisfacao: 4, nps: 9 }),
      resposta({ satisfacao: 4, nps: 8 }),
    ];
    let i = Object.fromEntries(calcularIndicadores(d).map((x) => [x.id, x]));
    expect(i["PS1"]!.valor).toBe("2%");
    expect(i["PS2"]!.valor).toBe("4 de 5");
    expect(i["PS2"]!.detalhes[0]).toEqual(["Satisfeitos (notas 4 e 5)", "75%"]);
    expect(i["PS3"]!.situacao).toBe("nao_se_aplica");
    d.npsHabilitado = true;
    i = Object.fromEntries(calcularIndicadores(d).map((x) => [x.id, x]));
    expect(i["PS3"]!.valor).toBe("25");
    expect(nps([10, 9, 0, 7])).toBe(25);
    expect(nps([])).toBeNull();
  });
});

describe("importação da pesquisa", () => {
  it("lê o modelo do sistema", () => {
    const r = importarRespostas(MODELO_CSV, "GO");
    expect(r.erros).toEqual([]);
    expect(r.respostas[0]).toMatchObject({
      satisfacao: 5,
      nps: 9,
      notouSustentabilidade: true,
      meioTransporte: "Ônibus ou metrô",
      municipioOrigem: GOIANIA,
    });
  });

  it("reconhece cabeçalhos por extenso, aspas e vírgula, e aponta linhas inválidas", () => {
    const csv = [
      '"Carimbo de data/hora","Satisfação geral com o evento","Você recomendaria o evento?","Cidade de origem","Comentários"',
      '"2026/09/17 10:00","4 - Satisfeito","10","Anápolis","Gostei, ""muito"""',
      '"2026/09/17 10:05","","8","",""',
    ].join("\n");
    const r = importarRespostas(csv, "GO");
    expect(r.colunasIgnoradas).toEqual(["Carimbo de data/hora"]);
    expect(r.respostas).toHaveLength(1);
    expect(r.respostas[0]).toMatchObject({
      satisfacao: 4,
      nps: 10,
      municipioOrigem: ANAPOLIS,
      comentario: 'Gostei, "muito"',
    });
    expect(r.erros[0]!.linha).toBe(3);
  });

  it("sem coluna de satisfação, não importa nada", () => {
    expect(importarRespostas("nps\n10\n", null).erros[0]!.mensagem).toMatch(/satisfação/);
    expect(lerCsv("a;b\n1;2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
