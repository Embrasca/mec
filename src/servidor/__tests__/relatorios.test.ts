import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { caracterizacaoVazia } from "@/domain/metodologia/caracterizacao";
import { V3_16 } from "@/domain/metodologia/v3_16";
import { correspondencia } from "@/domain/relatorio";
import { abasDoRelatorio } from "@/lib/planilha-do-relatorio";
import { gerarXlsx } from "@/lib/xlsx";
import { comoUsuario, usarDriver } from "../db.server";
import { adicionarMembro, criarEvento } from "../servicos/eventos.server";
import { confirmarEnquadramento, salvarFicha } from "../servicos/governanca.server";
import { fecharInventario, salvarInventario } from "../servicos/inventario.server";
import { salvarCompensacao } from "../servicos/posEvento.server";
import { salvarRegistro } from "../servicos/esg.server";
import { registroEsgVazio } from "@/domain/esg/esquemas";
import { ESSENCIAIS } from "@/domain/esg/indicadores";
import {
  canonico,
  gerarRelatorio,
  listarRelatorios,
  obterRelatorio,
} from "../servicos/relatorios.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;
let gestora: { id: string; email: string };
let equipe: { id: string; email: string };
let leitor: { id: string; email: string };
let eventoId: string;
const hoje = "2026-11-19";

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
      alegacao: "Emissões residuais compensadas",
      responsavelGestaoClimatica: "Comissão",
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
  await salvarInventario(equipe.id, {
    eventoId,
    etapa: "ex_post",
    versao: 0,
    linhas: [{ ...linha, quantidade: 800, qualidade: 4, evidencia: "nf.pdf" }],
  });
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

describe("relatórios", () => {
  let preliminar: string;

  it("a equipe gera o preliminar; o leitor não gera", async () => {
    const r = await gerarRelatorio(equipe.id, {
      eventoId,
      tipo: "preliminar",
      framework: "GRI + ISO 20121",
      hoje,
    });
    expect(r.numero).toBe(1);
    preliminar = r.id;
    await expect(
      gerarRelatorio(leitor.id, { eventoId, tipo: "preliminar", framework: "GRI", hoje }),
    ).rejects.toThrow(/consulta/);
  });

  it("o final exige gestor e o ex-post fechado, no serviço e no banco", async () => {
    await expect(
      gerarRelatorio(equipe.id, { eventoId, tipo: "final", framework: "GRI", hoje }),
    ).rejects.toThrow(/gestor/);
    await expect(
      gerarRelatorio(gestora.id, { eventoId, tipo: "final", framework: "GRI", hoje }),
    ).rejects.toThrow(/ex-post fechado/);
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql(
          `insert into relatorios (evento_id, numero, tipo, framework, dados, hash, gerado_por)
           values ($1, 99, 'final', 'GRI', '{}', repeat('a', 64), $2)`,
          [eventoId, gestora.id],
        ),
      ),
    ).rejects.toThrow(/ex-post fechado/);
  });

  it("congela o conteúdo: frase, aviso da alegação, memória e correspondência", async () => {
    const r = await obterRelatorio(leitor.id, eventoId, preliminar);
    expect(r.integro).toBe(true);
    expect(r.dados.frase).toBe("Evento com emissões quantificadas");
    expect(r.dados.avisoAlegacao).toMatch(/vai além/);
    expect(r.dados.memoria).toHaveLength(1);
    expect(r.dados.comparacao?.total.pct).toBeCloseTo(-0.2, 10);
    expect(r.dados.exPost.fechadoEm).toBeNull();
    const t = correspondencia(r.framework, r.dados);
    expect(t.map((x) => x.titulo)).toEqual(["GHG Protocol", "GRI (GRI 3 e GRI 305)", "ISO 20121"]);
    const abas = abasDoRelatorio(r.dados, {
      numero: r.numero,
      tipo: r.tipo,
      framework: r.framework,
      geradoEm: r.geradoEm,
      geradoPor: r.geradoPor,
      hash: r.hash,
    });
    expect(gerarXlsx(abas).byteLength).toBeGreaterThan(1000);
  });

  it("versão final depois de fechar o ex-post e compensar; o preliminar não muda", async () => {
    await fecharInventario(gestora.id, eventoId, "ex_post", 1);
    await salvarCompensacao(equipe.id, {
      eventoId,
      versao: 0,
      dados: { omissaoT: 0, omissaoDescricao: null, aposentadaT: 100, comprovante: "cert" },
    });
    await expect(
      gerarRelatorio(gestora.id, { eventoId, tipo: "final", framework: "GHG Protocol", hoje }),
    ).rejects.toThrow(/ESG essenciais: ML1, ML2/);
    await salvarRegistro(equipe.id, {
      eventoId,
      versao: 0,
      dados: {
        ...registroEsgVazio(),
        naoSeAplica: Object.fromEntries(
          ESSENCIAIS.map((id) => [id, { justificativa: "Teste: não se aplica" }]),
        ),
      },
    });
    const f = await gerarRelatorio(gestora.id, {
      eventoId,
      tipo: "final",
      framework: "GHG Protocol",
      hoje,
    });
    expect(f.numero).toBe(2);
    const r = await obterRelatorio(gestora.id, eventoId, f.id);
    expect(r.dados.frase).toBe("Emissões residuais compensadas");
    expect(correspondencia(r.framework, r.dados).map((x) => x.titulo)).toEqual(["GHG Protocol"]);
    const antigo = await obterRelatorio(gestora.id, eventoId, preliminar);
    expect(antigo.dados.frase).toBe("Evento com emissões quantificadas");
    const l = await listarRelatorios(leitor.id, eventoId);
    expect(l.lista.map((x) => x.numero)).toEqual([2, 1]);
  });

  it("versões não podem ser alteradas nem apagadas; adulteração é detectada", async () => {
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql("update relatorios set framework = 'GRI' where id = $1 returning id", [preliminar]),
      ),
    ).rejects.toThrow();
    await expect(
      comoUsuario(gestora.id, (sql) =>
        sql("delete from relatorios where id = $1 returning id", [preliminar]),
      ),
    ).rejects.toThrow();
    // Alteração feita por fora da aplicação (dono do banco).
    await banco.db.query(
      `update relatorios set dados = jsonb_set(dados, '{frase}', '"Evento carbono neutro"') where id = $1`,
      [preliminar],
    );
    expect((await obterRelatorio(gestora.id, eventoId, preliminar)).integro).toBe(false);
  });

  it("JSON canônico não depende da ordem das chaves", () => {
    expect(canonico({ b: 1, a: [{ d: null, c: "x" }] })).toBe(
      canonico({ a: [{ c: "x", d: null }], b: 1 }),
    );
  });
});
