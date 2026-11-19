/** Painel gerencial do portfólio e metas (Etapa 7). */
import { z } from "zod";
import { faseDoEvento } from "@/domain/evento";
import { acompanhar, type DadosDoFornecedor } from "@/domain/metodologia/fornecedores";
import { situacaoDaAcao } from "@/domain/gestao";
import {
  avaliarPortfolio,
  consolidar,
  metaSchema,
  type Meta,
  type ResumoDoEvento,
} from "@/domain/painel";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { lerEsg } from "./esg.server";
import { lerEventosAtivos, type EventoResumo } from "./eventos.server";
import { lerAcoes } from "./gestao.server";
import { obterPosEventoNaTransacao } from "./posEvento.server";
import { exigirAdmin } from "./usuarios.server";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function resumir(sql: Sql, evento: EventoResumo, hoje: string): Promise<ResumoDoEvento> {
  const pos = await obterPosEventoNaTransacao(sql, evento.id);
  const esg = await lerEsg(sql, evento);
  const p = pos.resultados.principais;
  const temPost = pos.exPost.existe;
  const temAnte = pos.exAnte.existe;
  const fonte = temPost ? "ex_post" : temAnte ? "ex_ante" : null;
  const total = fonte === "ex_post" ? p.total : fonte === "ex_ante" ? p.exAnte : null;
  const participanteDia =
    pos.publico.participantesDiaSoma && pos.publico.participantesDiaSoma > 0
      ? pos.publico.participantesDiaSoma
      : (pos.publico.participantesDia ?? 0) * (pos.publico.dias ?? 0);
  const indicador = (id: string) => esg.indicadores.find((i) => i.id === id)?.numero ?? null;
  const acoes = await lerAcoes(sql, evento.id);
  const [contagens] = await sql<{ ocorrencias: number; finais: number }>(
    `select (select count(*)::int from ocorrencias where evento_id = $1 and situacao <> 'Resolvida') as ocorrencias,
            (select count(*)::int from relatorios where evento_id = $1 and tipo = 'final') as finais`,
    [evento.id],
  );
  const fornecedores = await sql<DadosDoFornecedor>(
    `select nome, tipo, contato, to_char(enviado_em, 'YYYY-MM-DD') as "enviadoEm",
            to_char(recebido_em, 'YYYY-MM-DD') as "recebidoEm", ha_subcontratados as "haSubcontratados",
            subcontratados_incluidos as "subcontratadosIncluidos", observacao
     from fornecedores where evento_id = $1`,
    [evento.id],
  );
  const fase = faseDoEvento(hoje, evento.dataInicio, evento.dataFim);
  return {
    id: evento.id,
    nome: evento.nome,
    cor: evento.cor,
    nivel: evento.nivel,
    fase,
    dataInicio: evento.dataInicio,
    dataFim: evento.dataFim,
    emissoes: {
      fonte,
      fechado: fonte === "ex_post" ? Boolean(pos.exPost.fechadoEm) : Boolean(pos.exAnte.fechadoEm),
      total,
      porParticipanteDia:
        total !== null && participanteDia > 0 ? (total * 1000) / participanteDia : null,
    },
    variacao: temPost && temAnte ? p.variacao : null,
    primario: temPost ? pos.resultados.qualidade.primario : null,
    compensacaoCompleta: pos.saldo.completa.startsWith("SIM"),
    relatorioFinal: (contagens?.finais ?? 0) > 0,
    esg: {
      essenciaisPendentes: esg.pendencias.map((x) => x.id),
      maoDeObraLocal: indicador("ML2"),
      gastoLocal: indicador("CS2"),
      satisfacao: indicador("PS2"),
    },
    pendencias: {
      acoesAtrasadas: acoes.filter((a) => situacaoDaAcao(a, hoje) === "atrasada").length,
      ocorrenciasAbertas: contagens?.ocorrencias ?? 0,
      fornecedoresAtrasados: fornecedores.filter((f) =>
        acompanhar(f, evento.dataFim, hoje).alerta.startsWith("Prazo vencido"),
      ).length,
      inventarioAberto: fase === "Pós-evento" && !pos.exPost.fechadoEm,
    },
  };
}

async function lerMetas(sql: Sql) {
  return sql<Meta & { id: string }>(
    "select id::text, ano, indicador, alvo, observacao from metas_portfolio order by ano desc, indicador",
  );
}

export async function obterPainel(atorId: string, hoje: string) {
  const h = dia.parse(hoje);
  return comoUsuario(atorId, async (sql) => {
    const eventos = await lerEventosAtivos(sql);
    const resumos: ResumoDoEvento[] = [];
    // Uma transação só, evento por evento: o banco fica na mesma região do servidor.
    for (const e of eventos) resumos.push(await resumir(sql, e, h));
    const metas = await lerMetas(sql);
    return {
      eventos: resumos,
      consolidado: consolidar(resumos),
      metas,
      avaliacao: avaliarPortfolio(metas, resumos),
    };
  });
}

export const salvarMetaSchema = z.object({ id: z.string().uuid().nullable(), dados: metaSchema });

export async function salvarMeta(atorId: string, entrada: z.input<typeof salvarMetaSchema>) {
  const d = salvarMetaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const m = d.dados;
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update metas_portfolio set ano = $2, indicador = $3, alvo = $4, observacao = $5,
                  atualizado_por = $6, atualizado_em = now() where id = $1 returning id::text`,
          [d.id, m.ano, m.indicador, m.alvo, m.observacao, atorId],
        )
      : await sql<{ id: string }>(
          `insert into metas_portfolio (ano, indicador, alvo, observacao, atualizado_por)
           values ($1, $2, $3, $4, $5) returning id::text`,
          [m.ano, m.indicador, m.alvo, m.observacao, atorId],
        );
    if (!r) throw new ErroDeNegocio("Meta não encontrada.");
    await auditar(sql, {
      usuarioId: atorId,
      acao: "salvar_meta",
      entidade: "meta",
      entidadeId: r.id,
      detalhes: m,
    });
    return { id: r.id };
  });
}

export async function removerMeta(atorId: string, id: string) {
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [r] = await sql<{ id: string }>(
      "delete from metas_portfolio where id = $1 returning id::text",
      [z.string().uuid().parse(id)],
    );
    if (!r) throw new ErroDeNegocio("Meta não encontrada.");
    await auditar(sql, {
      usuarioId: atorId,
      acao: "remover_meta",
      entidade: "meta",
      entidadeId: id,
    });
    return { ok: true };
  });
}
