import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { equipeVazia, fornecedorEsgVazio, registroEsgVazio } from "@/domain/esg/esquemas";
import { importarRespostas, MODELO_CSV } from "@/domain/esg/importacao";
import { comoPublico, usarDriver } from "../db.server";
import { adicionarMembro, criarEvento, obterEvento } from "../servicos/eventos.server";
import { salvarFornecedor } from "../servicos/inventario.server";
import {
  baixarAnexo,
  configurarPesquisa,
  desfazerImportacao,
  enviarAnexo,
  importarRespostasDaPesquisa,
  obterEsg,
  obterPesquisaPublica,
  removerItem,
  responderPesquisa,
  salvarFornecedorEsg,
  salvarItem,
  salvarRegistro,
} from "../servicos/esg.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let gestora: { id: string; email: string };
let equipe: { id: string; email: string };
let leitor: { id: string; email: string };
let estranho: { id: string; email: string };
let eventoId: string;
let token: string;

const resposta = {
  satisfacao: 5,
  nps: 10,
  organizacao: 5,
  conteudo: 4,
  alimentacao: null,
  acessibilidade: null,
  sustentabilidade: null,
  notouSustentabilidade: true,
  meioTransporte: "Carro" as const,
  municipioOrigem: 5201405,
  comentario: "Ótimo",
};

beforeAll(async () => {
  banco = await criarBancoDeTeste();
  const admin = await banco.conta("Admin", { admin: true });
  gestora = await banco.conta("Gestora");
  equipe = await banco.conta("Equipe");
  leitor = await banco.conta("Leitor");
  estranho = await banco.conta("Estranho");
  ({ id: eventoId } = await criarEvento(admin.id, {
    nome: "Seminário",
    instituicao: "Instituto",
    cidade: "Goiânia",
    uf: "GO",
    dataInicio: "2026-09-15",
    dataFim: "2026-09-17",
    cor: "#1e6f5c",
    descricao: null,
    gestorId: gestora.id,
  }));
  await adicionarMembro(gestora.id, { eventoId, email: equipe.email, papel: "equipe" });
  await adicionarMembro(gestora.id, { eventoId, email: leitor.email, papel: "leitor" });
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("ESG", () => {
  it("o evento guarda o município IBGE achado pelo nome", async () => {
    expect((await obterEvento(leitor.id, eventoId)).municipioIbge).toBe(5208707);
    const e = await obterEsg(leitor.id, eventoId);
    expect(e.area.descricao).toMatch(/Goiânia/);
    expect(e.pendencias.map((p) => p.id)).toContain("ML1");
  });

  it("equipes: a equipe registra, o leitor não; o cálculo sai no indicador", async () => {
    const { id } = await salvarItem(equipe.id, {
      eventoId,
      lista: "equipe",
      id: null,
      dados: { ...equipeVazia(), nome: "Montagem", pessoas: 20, pessoasLocais: 15 },
    });
    await expect(
      salvarItem(leitor.id, {
        eventoId,
        lista: "equipe",
        id: null,
        dados: { ...equipeVazia(), nome: "x", pessoas: 1 },
      }),
    ).rejects.toThrow(/consulta/);
    await expect(
      salvarItem(equipe.id, {
        eventoId,
        lista: "equipe",
        id: null,
        dados: { ...equipeVazia(), nome: "x", pessoas: 2, pessoasLocais: 5 },
      }),
    ).rejects.toThrow();
    const e = await obterEsg(leitor.id, eventoId);
    expect(e.indicadores.find((i) => i.id === "ML2")!.valor).toBe("75%");
    expect(e.pendencias.map((p) => p.id)).not.toContain("ML1");
    await expect(obterEsg(estranho.id, eventoId)).rejects.toThrow();
    await removerItem(equipe.id, eventoId, "equipe", id);
    expect((await obterEsg(leitor.id, eventoId)).equipes).toHaveLength(0);
  });

  it("fornecedor: dados de cadeia de suprimentos e diligência", async () => {
    await salvarFornecedor(equipe.id, {
      eventoId,
      id: null,
      dados: {
        nome: "Buffet Central",
        tipo: "Alimentação",
        contato: null,
        enviadoEm: null,
        recebidoEm: null,
        haSubcontratados: null,
        subcontratadosIncluidos: null,
        observacao: null,
      },
    });
    const f = (await obterEsg(equipe.id, eventoId)).fornecedores[0]!;
    await salvarFornecedorEsg(equipe.id, {
      eventoId,
      fornecedorId: f.id,
      dados: {
        ...fornecedorEsgVazio(),
        municipioIbge: 5201405,
        valorContratado: 12500.5,
        lideranca: ["Mulheres"],
        consultaTrabalhoEscravo: "2026-08-01",
        consultaIbama: "2026-08-01",
        consultaRegularidade: "2026-08-01",
      },
    });
    const e = await obterEsg(leitor.id, eventoId);
    const i = Object.fromEntries(e.indicadores.map((x) => [x.id, x]));
    expect(e.fornecedores[0]!.valorContratado).toBe(12500.5);
    expect(i["CS1"]!.valor).toBe("100%");
    expect(i["CS6"]!.situacao).toBe("ok");
  });

  it("não se aplica só para essenciais, com controle de versão", async () => {
    const dados = {
      ...registroEsgVazio(),
      naoSeAplica: { RS1: { justificativa: "Evento interno" } },
    };
    await expect(
      salvarRegistro(equipe.id, {
        eventoId,
        versao: 0,
        dados: { ...dados, naoSeAplica: { ML7: { justificativa: "xxxxx" } } },
      }),
    ).rejects.toThrow();
    await salvarRegistro(equipe.id, { eventoId, versao: 0, dados });
    await expect(salvarRegistro(equipe.id, { eventoId, versao: 0, dados })).rejects.toThrow(
      /mudou/,
    );
    const e = await obterEsg(leitor.id, eventoId);
    expect(e.indicadores.find((x) => x.id === "RS1")!.situacao).toBe("nao_se_aplica");
  });
});

describe("pesquisa de satisfação", () => {
  it("só o gestor configura; o link é gerado", async () => {
    await expect(
      configurarPesquisa(equipe.id, { eventoId, aberta: true, nps: false }),
    ).rejects.toThrow(/gestor/);
    const p = await configurarPesquisa(gestora.id, { eventoId, aberta: true, nps: false });
    token = p.config!.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("resposta pública pelo link, sem login; NPS ignorado quando a gestão não pediu", async () => {
    expect(await obterPesquisaPublica(token)).toMatchObject({
      nome: "Seminário",
      aberta: true,
      nps: false,
    });
    await responderPesquisa({ token, resposta });
    const e = await obterEsg(leitor.id, eventoId);
    expect(e.pesquisa.respostas).toHaveLength(1);
    expect(e.pesquisa.respostas[0]).toMatchObject({ origem: "link", nps: null, satisfacao: 5 });
    await expect(obterPesquisaPublica("x".repeat(43))).rejects.toThrow(/inválido/);
    await expect(responderPesquisa({ token, resposta, site: "spam" })).rejects.toThrow();
  });

  it("o papel público não lê tabela nenhuma", async () => {
    await expect(comoPublico((sql) => sql("select * from pesquisa_respostas"))).rejects.toThrow();
    await expect(comoPublico((sql) => sql("select * from pesquisas"))).rejects.toThrow();
  });

  it("pesquisa fechada não aceita resposta; novo link invalida o antigo", async () => {
    await configurarPesquisa(gestora.id, { eventoId, aberta: false, nps: true });
    await expect(responderPesquisa({ token, resposta })).rejects.toThrow(/não está aberta/);
    const p = await configurarPesquisa(gestora.id, {
      eventoId,
      aberta: true,
      nps: true,
      novoLink: true,
    });
    expect(p.config!.token).not.toBe(token);
    await expect(responderPesquisa({ token, resposta })).rejects.toThrow(/não está aberta/);
    await responderPesquisa({ token: p.config!.token, resposta });
    const e = await obterEsg(leitor.id, eventoId);
    expect(e.pesquisa.respostas.find((r) => r.nps === 10)).toBeTruthy();
  });

  it("importação por planilha e desfazer", async () => {
    const r = importarRespostas(MODELO_CSV, "GO");
    const { importacaoId, importadas } = await importarRespostasDaPesquisa(equipe.id, {
      eventoId,
      respostas: r.respostas,
    });
    expect(importadas).toBe(1);
    expect((await obterEsg(leitor.id, eventoId)).pesquisa.respostas).toHaveLength(3);
    await expect(desfazerImportacao(equipe.id, eventoId, importacaoId)).rejects.toThrow(/gestor/);
    expect((await desfazerImportacao(gestora.id, eventoId, importacaoId)).removidas).toBe(1);
  });
});

describe("anexos", () => {
  const pdf = Buffer.from("%PDF-1.4\nconteudo de teste\n%%EOF").toString("base64");

  it("envia, confere o tipo pelo conteúdo e baixa", async () => {
    const { id } = await enviarAnexo(equipe.id, {
      eventoId,
      entidade: "registro_esg",
      entidadeId: "RS4",
      nome: "fotos-libras.pdf",
      tipo: "application/pdf",
      base64: pdf,
    });
    const a = await baixarAnexo(leitor.id, eventoId, id);
    expect(a).toMatchObject({ nome: "fotos-libras.pdf", tipo: "application/pdf", base64: pdf });
    await expect(
      enviarAnexo(equipe.id, {
        eventoId,
        entidade: "registro_esg",
        entidadeId: "RS4",
        nome: "falso.png",
        tipo: "image/png",
        base64: pdf,
      }),
    ).rejects.toThrow(/não corresponde/);
    await expect(
      enviarAnexo(leitor.id, {
        eventoId,
        entidade: "registro_esg",
        entidadeId: "RS4",
        nome: "x.pdf",
        tipo: "application/pdf",
        base64: pdf,
      }),
    ).rejects.toThrow(/consulta/);
    await expect(
      enviarAnexo(equipe.id, {
        eventoId,
        entidade: "equipe",
        entidadeId: crypto.randomUUID(),
        nome: "x.pdf",
        tipo: "application/pdf",
        base64: pdf,
      }),
    ).rejects.toThrow(/não encontrado/);
    await expect(baixarAnexo(estranho.id, eventoId, id)).rejects.toThrow();
  });
});
