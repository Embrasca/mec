import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { caracterizacaoVazia } from "@/domain/metodologia/caracterizacao";
import { ocorrenciaVazia } from "@/domain/metodologia/posEvento";
import { V3_16 } from "@/domain/metodologia/v3_16";
import { comoUsuario, usarDriver } from "../db.server";
import { adicionarMembro, criarEvento } from "../servicos/eventos.server";
import { confirmarEnquadramento, salvarFicha } from "../servicos/governanca.server";
import { fecharInventario, obterInventario, salvarInventario } from "../servicos/inventario.server";
import {
  listarOcorrencias,
  obterPosEvento,
  removerOcorrencia,
  salvarCompensacao,
  salvarDesvio,
  salvarOcorrencia,
} from "../servicos/posEvento.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let gestora: { id: string; email: string };
let equipe: { id: string; email: string };
let leitor: { id: string; email: string };
let estranho: { id: string; email: string };
let eventoId: string;

const linha = {
  fornecedor: null,
  item: "Refeição com carne bovina (porção)",
  descricao: null,
  premissa: "Cardápio",
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
  await salvarFicha(equipe.id, {
    eventoId,
    versao: 0,
    dados: {
      ...caracterizacaoVazia(),
      participantesDia: 150,
      participantesTotal: 200,
      pctLocal: 100,
      complexidade: V3_16.criteriosComplexidade.map((c) => c.opcoes[1]!),
    },
  });
  await confirmarEnquadramento(gestora.id, {
    eventoId,
    nivelVisto: 2,
    responsavel: "Comissão",
    oQueMudou: null,
    limitacaoDeclarada: null,
  });
  await salvarInventario(equipe.id, {
    eventoId,
    etapa: "ex_ante",
    versao: 0,
    linhas: [{ ...linha, quantidade: 1000 }],
  });
  await fecharInventario(gestora.id, eventoId, "ex_ante", 1);
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("inventário ex-post", () => {
  it("guarda qualidade e evidência e aplica os alertas do nível", async () => {
    const r = await salvarInventario(equipe.id, {
      eventoId,
      etapa: "ex_post",
      versao: 0,
      linhas: [{ ...linha, quantidade: 800, qualidade: 4, evidencia: null }],
    });
    expect(r.linhas[0]).toMatchObject({ qualidade: 4, evidencia: null });
    expect(r.resultado.linhas[0]!.alerta).toBe("Falta a evidência");
    const ok = await salvarInventario(equipe.id, {
      eventoId,
      etapa: "ex_post",
      versao: r.versao,
      linhas: [{ ...linha, quantidade: 800, qualidade: 4, evidencia: "nf.pdf" }],
    });
    expect(ok.resultado.pendencias).toBe(0);
  });

  it("no ex-ante, qualidade e evidência são descartadas", async () => {
    const r = await obterInventario(equipe.id, eventoId, "ex_ante");
    expect(r.linhas[0]).toMatchObject({ qualidade: null, evidencia: null });
  });
});

describe("ocorrências", () => {
  let id: string;
  it("a equipe registra; o leitor e quem não é do evento não", async () => {
    ({ id } = await salvarOcorrencia(equipe.id, {
      eventoId,
      id: null,
      dados: {
        ...ocorrenciaVazia(),
        data: "2026-09-16",
        fase: "Execução",
        categoria: "5 Alimentação",
        ocorrencia: "Buffet não enviou a contagem de refeições",
        impacto: "Dado atrasado",
        situacao: "Aberta",
      },
    }));
    await expect(
      salvarOcorrencia(leitor.id, {
        eventoId,
        id: null,
        dados: { ...ocorrenciaVazia(), ocorrencia: "x" },
      }),
    ).rejects.toThrow(/consulta/);
    await expect(listarOcorrencias(estranho.id, eventoId)).rejects.toThrow();
    const l = await listarOcorrencias(leitor.id, eventoId);
    expect(l.resumo).toMatchObject({ registradas: 1, abertas: 1 });
    expect(l.lista[0]).toMatchObject({ data: "2026-09-16", situacao: "Aberta" });
  });

  it("ocorrência aberta impede fechar o ex-post, no serviço e no banco", async () => {
    const inv = await obterInventario(gestora.id, eventoId, "ex_post");
    await expect(fecharInventario(gestora.id, eventoId, "ex_post", inv.versao)).rejects.toThrow(
      /ocorrência/,
    );
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql(
          `update inventarios set fechado_em = now(), fechado_por = $2, base_fatores_id = (select base_fatores_id from eventos where id = $1), resultado = '{}'
           where evento_id = $1 and etapa = 'ex_post'`,
          [eventoId, gestora.id],
        ),
      ),
    ).rejects.toThrow(/ocorrências abertas/);
  });

  it("resolvida, o ex-post fecha", async () => {
    await salvarOcorrencia(equipe.id, {
      eventoId,
      id,
      dados: {
        ...ocorrenciaVazia(),
        ocorrencia: "Buffet não enviou a contagem de refeições",
        situacao: "Resolvida",
        premissa: "Contagem pelas fichas de entrada",
      },
    });
    const inv = await obterInventario(gestora.id, eventoId, "ex_post");
    await expect(fecharInventario(gestora.id, eventoId, "ex_post", inv.versao)).resolves.toEqual({
      ok: true,
    });
  });

  it("remover exige edição", async () => {
    await expect(removerOcorrencia(leitor.id, eventoId, id)).rejects.toThrow(/consulta/);
    await removerOcorrencia(equipe.id, eventoId, id);
    expect((await listarOcorrencias(equipe.id, eventoId)).resumo.registradas).toBe(0);
  });
});

describe("resultados, comparação e compensação", () => {
  it("calcula a partir dos dois inventários e do público da ficha", async () => {
    const r = await obterPosEvento(leitor.id, eventoId);
    expect(r.exAnte.fechadoEm).not.toBeNull();
    expect(r.exPost.fechadoEm).not.toBeNull();
    const ali = r.resultados.categorias.find((c) => c.categoria === "5 Alimentação")!;
    expect(ali.variacao).toBeCloseTo(-0.2, 10);
    expect(r.resultados.principais.porParticipante).toBeCloseTo(
      (r.resultados.principais.total * 1000) / 200,
      10,
    );
    // Sem a soma de participantes-dia, usa participantes por dia × dias (150 × 3).
    expect(r.resultados.principais.porParticipanteDia).toBeCloseTo(
      (r.resultados.principais.total * 1000) / 450,
      10,
    );
    expect(r.resultados.qualidade.primario).toBe(1);
    expect(r.comparacao.semOrigem).toBe(1);
    expect(r.saldo.aCompensar).toBe(Math.ceil(r.resultados.principais.total));
  });

  it("origem do desvio e compensação, com controle de versão", async () => {
    await salvarDesvio(equipe.id, {
      eventoId,
      dados: { categoria: "5 Alimentação", origem: "Escala", explicacao: "Menos público" },
    });
    await expect(
      salvarDesvio(leitor.id, {
        eventoId,
        dados: { categoria: "5 Alimentação", origem: "Desempenho", explicacao: null },
      }),
    ).rejects.toThrow(/consulta/);
    const dados = {
      omissaoT: 0,
      omissaoDescricao: null,
      aposentadaT: 100,
      comprovante: "cert.pdf",
    };
    await salvarCompensacao(equipe.id, { eventoId, versao: 0, dados });
    await expect(salvarCompensacao(equipe.id, { eventoId, versao: 0, dados })).rejects.toThrow(
      /mudou/,
    );
    const r = await obterPosEvento(equipe.id, eventoId);
    expect(r.comparacao.semOrigem).toBe(0);
    expect(r.compensacao).toMatchObject({ aposentadaT: 100, versao: 1 });
    expect(r.saldo).toMatchObject({ saldo: 0, completa: "SIM - quantidade suficiente" });
  });
});
