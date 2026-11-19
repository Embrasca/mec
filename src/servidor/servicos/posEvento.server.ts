/** Execução e pós-evento: ocorrências, resultados, comparação e compensação. */
import { z } from "zod";
import { diasDoEvento } from "@/domain/metodologia/nivel";
import {
  calcularComparacao,
  calcularCompensacao,
  calcularResultados,
  compensacaoSchema,
  compensacaoVazia,
  desvioSchema,
  ocorrenciaSchema,
  resumirOcorrencias,
  type Compensacao,
  type Desvio,
  type Ocorrencia,
} from "@/domain/metodologia/posEvento";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { eventoVisivel, type EventoResumo } from "./eventos.server";
import { lerInventario } from "./inventario.server";

const uuid = z.string().uuid();

async function exigirEdicao(sql: Sql, eventoId: string): Promise<EventoResumo> {
  const evento = await eventoVisivel(sql, uuid.parse(eventoId));
  if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
  return evento;
}

// ---------------------------------------------------------------------
// Ocorrências
// ---------------------------------------------------------------------

export interface OcorrenciaGravada extends Ocorrencia {
  id: string;
}

async function lerOcorrencias(sql: Sql, eventoId: string) {
  return sql<OcorrenciaGravada>(
    `select id::text, to_char(data, 'YYYY-MM-DD') as data, fase, categoria, ocorrencia, impacto, acao,
            responsavel, situacao, premissa
     from ocorrencias where evento_id = $1 order by data nulls last, criado_em`,
    [eventoId],
  );
}

export async function listarOcorrencias(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const lista = await lerOcorrencias(sql, evento.id);
    return { lista, resumo: resumirOcorrencias(lista) };
  });
}

export const salvarOcorrenciaSchema = z.object({
  eventoId: z.string().uuid(),
  id: z.string().uuid().nullable(),
  dados: ocorrenciaSchema,
});

export async function salvarOcorrencia(
  atorId: string,
  entrada: z.input<typeof salvarOcorrenciaSchema>,
) {
  const d = salvarOcorrenciaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const o = d.dados;
    const valores = [
      o.data,
      o.fase,
      o.categoria,
      o.ocorrencia,
      o.impacto,
      o.acao,
      o.responsavel,
      o.situacao,
      o.premissa,
      atorId,
    ];
    const [r] = d.id
      ? await sql<{ id: string }>(
          `update ocorrencias set data=$3, fase=$4, categoria=$5, ocorrencia=$6, impacto=$7, acao=$8,
                  responsavel=$9, situacao=$10, premissa=$11, atualizado_por=$12, atualizado_em=now()
           where id = $1 and evento_id = $2 returning id::text`,
          [d.id, d.eventoId, ...valores],
        )
      : await sql<{ id: string }>(
          `insert into ocorrencias (evento_id, data, fase, categoria, ocorrencia, impacto, acao, responsavel,
                                    situacao, premissa, atualizado_por)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id::text`,
          [d.eventoId, ...valores],
        );
    if (!r) throw new ErroDeNegocio("Ocorrência não encontrada.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_ocorrencia",
      entidade: "ocorrencia",
      entidadeId: r.id,
      detalhes: { situacao: o.situacao },
    });
    return { id: r.id };
  });
}

export async function removerOcorrencia(atorId: string, eventoId: string, id: string) {
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, eventoId);
    const [r] = await sql<{ id: string }>(
      "delete from ocorrencias where id = $1 and evento_id = $2 returning id::text",
      [uuid.parse(id), eventoId],
    );
    if (!r) throw new ErroDeNegocio("Ocorrência não encontrada.");
    await auditar(sql, {
      usuarioId: atorId,
      eventoId,
      acao: "remover_ocorrencia",
      entidade: "ocorrencia",
      entidadeId: id,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Resultados (aba 4), comparação (aba 5) e compensação (aba 6)
// ---------------------------------------------------------------------

async function lerCompensacao(sql: Sql, eventoId: string) {
  const [c] = await sql<Compensacao & { versao: number }>(
    `select omissao_t as "omissaoT", omissao_descricao as "omissaoDescricao", aposentada_t as "aposentadaT",
            comprovante, versao
     from compensacoes where evento_id = $1`,
    [eventoId],
  );
  return c ?? { ...compensacaoVazia(), versao: 0 };
}

export async function obterPosEvento(atorId: string, eventoId: string) {
  return comoUsuario(atorId, (sql) => obterPosEventoNaTransacao(sql, eventoId));
}

export async function obterPosEventoNaTransacao(sql: Sql, eventoId: string) {
  const id = uuid.parse(eventoId);
  const post = await lerInventario(sql, id, "ex_post");
  const ante = await lerInventario(sql, id, "ex_ante");
  const evento = post.evento;
  const [ficha] = await sql<{
    participantes: number | null;
    participantes_dia: number | null;
    participantes_dia_soma: number | null;
  }>(
    `select (dados->>'participantesTotal')::double precision as participantes,
            (dados->>'participantesDia')::double precision as participantes_dia,
            (dados->>'participantesDiaSoma')::double precision as participantes_dia_soma
     from caracterizacoes where evento_id = $1`,
    [id],
  );
  const publico = {
    participantes: ficha?.participantes ?? null,
    participantesDia: ficha?.participantes_dia ?? null,
    dias: diasDoEvento({ dataInicio: evento.dataInicio, dataFim: evento.dataFim }),
    participantesDiaSoma: ficha?.participantes_dia_soma ?? null,
  };
  const temExAnte = ante.versao > 0;
  const desvios = await sql<Desvio>(
    "select categoria, origem, explicacao from desvios where evento_id = $1",
    [id],
  );
  const compensacao = await lerCompensacao(sql, id);
  const ocorrencias = resumirOcorrencias(await lerOcorrencias(sql, id));
  return {
    evento,
    publico,
    exAnte: { existe: temExAnte, fechadoEm: ante.fechadoEm },
    exPost: {
      existe: post.versao > 0,
      fechadoEm: post.fechadoEm,
      pendencias: post.resultado.pendencias,
    },
    ocorrencias,
    resultados: calcularResultados(
      temExAnte ? ante.resultado : null,
      post.resultado,
      post.linhas,
      publico,
      evento.nivel,
    ),
    comparacao: calcularComparacao(ante.resultado, post.resultado, desvios),
    compensacao,
    saldo: calcularCompensacao(post.resultado.totais.total, compensacao),
  };
}

export const salvarDesvioSchema = z.object({
  eventoId: z.string().uuid(),
  dados: desvioSchema,
});

export async function salvarDesvio(atorId: string, entrada: z.input<typeof salvarDesvioSchema>) {
  const d = salvarDesvioSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const x = d.dados;
    await sql(
      `insert into desvios (evento_id, categoria, origem, explicacao, atualizado_por) values ($1,$2,$3,$4,$5)
       on conflict (evento_id, categoria) do update set origem = excluded.origem, explicacao = excluded.explicacao,
         atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
      [d.eventoId, x.categoria, x.origem, x.explicacao, atorId],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_desvio",
      entidade: "desvio",
      entidadeId: x.categoria,
      detalhes: { origem: x.origem },
    });
    return { ok: true };
  });
}

export const salvarCompensacaoSchema = z.object({
  eventoId: z.string().uuid(),
  versao: z.number().int().min(0),
  dados: compensacaoSchema,
});

export async function salvarCompensacao(
  atorId: string,
  entrada: z.input<typeof salvarCompensacaoSchema>,
) {
  const d = salvarCompensacaoSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    await exigirEdicao(sql, d.eventoId);
    const c = d.dados;
    const valores = [c.omissaoT, c.omissaoDescricao, c.aposentadaT, c.comprovante, atorId];
    const r =
      d.versao === 0
        ? await sql(
            `insert into compensacoes (evento_id, omissao_t, omissao_descricao, aposentada_t, comprovante, atualizado_por)
             values ($1,$2,$3,$4,$5,$6) on conflict (evento_id) do nothing returning versao`,
            [d.eventoId, ...valores],
          )
        : await sql(
            `update compensacoes set omissao_t=$2, omissao_descricao=$3, aposentada_t=$4, comprovante=$5,
                    atualizado_por=$6, atualizado_em=now(), versao = versao + 1
             where evento_id = $1 and versao = $7 returning versao`,
            [d.eventoId, ...valores, d.versao],
          );
    if (r.length === 0)
      throw new ErroDeNegocio(
        "A compensação mudou enquanto você editava. Recarregue para ver a versão atual.",
      );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_compensacao",
      entidade: "compensacao",
      entidadeId: d.eventoId,
      detalhes: { aposentadaT: c.aposentadaT, omissaoT: c.omissaoT },
    });
    return { ok: true };
  });
}
