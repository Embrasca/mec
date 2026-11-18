import { z } from "zod";
import {
  caracterizacaoSchema,
  caracterizacaoVazia,
  type Caracterizacao,
} from "@/domain/metodologia/caracterizacao";
import { calcularEnquadramento, type Enquadramento } from "@/domain/metodologia/nivel";
import { METODOLOGIA_ID, V3_16, type Nivel } from "@/domain/metodologia/v3_16";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { eventoVisivel, type EventoResumo } from "./eventos.server";

export interface FichaDoEvento {
  evento: EventoResumo;
  dados: Caracterizacao;
  /** 0 quando a ficha ainda não foi salva. */
  versao: number;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  resultado: Enquadramento;
}

async function lerFicha(sql: Sql, eventoId: string): Promise<FichaDoEvento> {
  const evento = await eventoVisivel(sql, eventoId);
  if (evento.metodologia !== METODOLOGIA_ID)
    throw new ErroDeNegocio(`Metodologia ${evento.metodologia} não suportada nesta versão.`);
  const [linha] = await sql<{ dados: unknown; versao: number; em: string; por: string }>(
    `select c.dados, c.versao, to_char(c.atualizado_em, 'YYYY-MM-DD"T"HH24:MI:SSOF') as em, u.nome as por
     from caracterizacoes c left join usuarios u on u.id = c.atualizado_por
     where c.evento_id = $1`,
    [eventoId],
  );
  // Ficha gravada passa pelo mesmo esquema: se algo inválido chegou ao banco,
  // falha aqui em vez de calcular com dado errado.
  const dados = linha ? caracterizacaoSchema.parse(linha.dados) : caracterizacaoVazia();
  return {
    evento,
    dados,
    versao: linha?.versao ?? 0,
    atualizadoEm: linha?.em ?? null,
    atualizadoPor: linha?.por ?? null,
    resultado: calcularEnquadramento(dados, {
      dataInicio: evento.dataInicio,
      dataFim: evento.dataFim,
    }),
  };
}

export async function obterFicha(atorId: string, eventoId: string) {
  return comoUsuario(atorId, (sql) => lerFicha(sql, z.string().uuid().parse(eventoId)));
}

export const salvarFichaSchema = z.object({
  eventoId: z.string().uuid(),
  /** Versão que a pessoa tinha na tela; evita sobrescrever o trabalho de outra. */
  versao: z.number().int().min(0),
  dados: caracterizacaoSchema,
});

export async function salvarFicha(atorId: string, entrada: z.input<typeof salvarFichaSchema>) {
  const d = salvarFichaSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    const json = JSON.stringify(d.dados);
    const gravada =
      d.versao === 0
        ? await sql(
            `insert into caracterizacoes (evento_id, dados, atualizado_por) values ($1, $2, $3)
             on conflict (evento_id) do nothing returning versao`,
            [d.eventoId, json, atorId],
          )
        : await sql(
            `update caracterizacoes set dados = $2, versao = versao + 1, atualizado_por = $3,
                    atualizado_em = now()
             where evento_id = $1 and versao = $4 returning versao`,
            [d.eventoId, json, atorId, d.versao],
          );
    if (gravada.length === 0)
      throw new ErroDeNegocio(
        "Outra pessoa salvou a ficha enquanto você editava. Recarregue para ver a versão atual.",
      );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "salvar_caracterizacao",
      entidade: "caracterizacao",
      entidadeId: d.eventoId,
    });
    return lerFicha(sql, d.eventoId);
  });
}

// ---------------------------------------------------------------------
// Enquadramento: confirmar o nível calculado e registrar reenquadramentos.
// ---------------------------------------------------------------------

export const confirmarSchema = z.object({
  eventoId: z.string().uuid(),
  /** Nível que a pessoa viu na tela: se o cálculo mudou no meio, pede para revisar. */
  nivelVisto: z.number().int().min(1).max(4),
  responsavel: z.string().trim().min(1, "Informe o responsável.").max(200),
  oQueMudou: z.string().trim().max(4000).nullable(),
  limitacaoDeclarada: z.string().trim().max(4000).nullable(),
});

export async function confirmarEnquadramento(
  atorId: string,
  entrada: z.input<typeof confirmarSchema>,
) {
  const d = confirmarSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const ficha = await lerFicha(sql, d.eventoId);
    if (!ficha.evento.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento confirma o enquadramento.");
    if (ficha.versao === 0) throw new ErroDeNegocio("Salve a ficha de caracterização primeiro.");
    const r = ficha.resultado;
    if (r.pendencias.length > 0 || r.nivelFinal === null)
      throw new ErroDeNegocio(`Resolva antes de confirmar: ${r.pendencias.join(" ")}`);
    if (r.nivelFinal !== d.nivelVisto)
      throw new ErroDeNegocio("O nível calculado mudou. Revise o resultado e confirme de novo.");

    const atual = ficha.evento.nivel;
    if (atual !== null && r.nivelFinal <= atual)
      throw new ErroDeNegocio(
        `O nível oficial continua ${atual}: ${V3_16.notaSoSobe.split(".")[0]}.`,
      );
    const tipo = atual === null ? "inicial" : "reenquadramento";
    if (tipo === "reenquadramento" && !d.oQueMudou)
      throw new ErroDeNegocio("No reenquadramento, descreva o que mudou no evento.");

    const [registro] = await sql<{ id: string }>(
      `insert into enquadramentos (evento_id, tipo, nivel, nivel_anterior, metodologia, entradas,
                                   resultado, o_que_mudou, limitacao_declarada, responsavel, registrado_por)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id::text`,
      [
        d.eventoId,
        tipo,
        r.nivelFinal,
        atual,
        METODOLOGIA_ID,
        JSON.stringify({
          caracterizacao: ficha.dados,
          versaoDaFicha: ficha.versao,
          periodo: { dataInicio: ficha.evento.dataInicio, dataFim: ficha.evento.dataFim },
        }),
        JSON.stringify(r),
        d.oQueMudou,
        d.limitacaoDeclarada,
        d.responsavel,
        atorId,
      ],
    );
    await sql("update eventos set nivel = $2 where id = $1", [d.eventoId, r.nivelFinal]);
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: tipo === "inicial" ? "confirmar_enquadramento" : "reenquadrar",
      entidade: "enquadramento",
      entidadeId: registro!.id,
      detalhes: { nivel: r.nivelFinal, nivelAnterior: atual },
    });
    return { nivel: r.nivelFinal as Nivel, tipo };
  });
}

export interface RegistroDeEnquadramento {
  id: string;
  tipo: "inicial" | "reenquadramento";
  nivel: Nivel;
  nivelAnterior: Nivel | null;
  determinante: string | null;
  oQueMudou: string | null;
  limitacaoDeclarada: string | null;
  responsavel: string;
  registradoPor: string;
  registradoEm: string;
}

export async function listarEnquadramentos(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    await eventoVisivel(sql, eventoId);
    return sql<RegistroDeEnquadramento>(
      `select e.id::text, e.tipo, e.nivel, e.nivel_anterior as "nivelAnterior",
              e.resultado->>'determinante' as determinante,
              e.o_que_mudou as "oQueMudou", e.limitacao_declarada as "limitacaoDeclarada",
              e.responsavel, u.nome as "registradoPor",
              to_char(e.registrado_em, 'YYYY-MM-DD"T"HH24:MI:SSOF') as "registradoEm"
       from enquadramentos e join usuarios u on u.id = e.registrado_por
       where e.evento_id = $1 order by e.registrado_em desc`,
      [eventoId],
    );
  });
}

// ---------------------------------------------------------------------
// Aba B: acompanhamento dos requisitos do nível
// ---------------------------------------------------------------------

export interface LinhaDeAcompanhamento {
  fase: string;
  requisito: string;
  porNivel: string[];
  exigencia: string | null;
  feito: "Sim" | "Não" | null;
  observacao: string | null;
  atualizadoPor: string | null;
}

export async function obterAcompanhamento(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, eventoId);
    const marcados = await sql<{
      requisito: string;
      feito: "Sim" | "Não";
      observacao: string | null;
      por: string | null;
    }>(
      `select r.requisito, r.feito, r.observacao, u.nome as por
       from requisitos_acompanhamento r left join usuarios u on u.id = r.atualizado_por
       where r.evento_id = $1`,
      [eventoId],
    );
    const porRequisito = new Map(marcados.map((m) => [m.requisito, m]));
    const linhas: LinhaDeAcompanhamento[] = V3_16.requisitos.map((r) => {
      const m = porRequisito.get(r.requisito);
      return {
        fase: r.fase,
        requisito: r.requisito,
        porNivel: r.porNivel,
        exigencia: evento.nivel === null ? null : r.porNivel[evento.nivel - 1]!,
        feito: m?.feito ?? null,
        observacao: m?.observacao ?? null,
        atualizadoPor: m?.por ?? null,
      };
    });
    const cumpridos = linhas.filter((l) => l.feito === "Sim").length;
    return { evento, linhas, cumpridos, total: linhas.length };
  });
}

const REQUISITOS = V3_16.requisitos.map((r) => r.requisito) as [string, ...string[]];

export const marcarRequisitoSchema = z.object({
  eventoId: z.string().uuid(),
  requisito: z.enum(REQUISITOS),
  feito: z.enum(["Sim", "Não"]),
  observacao: z.string().trim().max(2000).nullable(),
});

export async function marcarRequisito(
  atorId: string,
  entrada: z.infer<typeof marcarRequisitoSchema>,
) {
  const d = marcarRequisitoSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    if (evento.nivel === null)
      throw new ErroDeNegocio("Confirme o enquadramento antes de acompanhar os requisitos.");
    await sql(
      `insert into requisitos_acompanhamento (evento_id, requisito, feito, observacao, atualizado_por)
       values ($1,$2,$3,$4,$5)
       on conflict (evento_id, requisito) do update
         set feito = excluded.feito, observacao = excluded.observacao,
             atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
      [d.eventoId, d.requisito, d.feito, d.observacao, atorId],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: d.eventoId,
      acao: "marcar_requisito",
      entidade: "requisito",
      entidadeId: d.requisito,
      detalhes: { feito: d.feito },
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------
// Auditoria (consulta)
// ---------------------------------------------------------------------

export interface LinhaDeAuditoria {
  id: string;
  em: string;
  usuario: string | null;
  evento: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
}

export async function listarAuditoria(atorId: string, eventoId: string | null, limite = 200) {
  return comoUsuario(atorId, (sql) =>
    sql<LinhaDeAuditoria>(
      `select a.id::text, to_char(a.em, 'YYYY-MM-DD"T"HH24:MI:SSOF') as em, u.nome as usuario,
              e.nome as evento, a.acao, a.entidade, a.entidade_id as "entidadeId"
       from auditoria a
       left join usuarios u on u.id = a.usuario_id
       left join eventos e on e.id = a.evento_id
       where ($1::uuid is null or a.evento_id = $1::uuid)
       order by a.em desc, a.id desc limit $2`,
      [eventoId, Math.min(Math.max(limite, 1), 500)],
    ),
  );
}
