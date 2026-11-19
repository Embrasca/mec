/** Relatórios do evento: monta o conteúdo, congela em versões e confere a integridade. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { calcularReducao } from "@/domain/metodologia/reducao";
import { avisoDaAlegacao, fraseAutorizada, memoriaDeCalculo } from "@/domain/metodologia/relatorio";
import { designacao, type Nivel } from "@/domain/metodologia/v3_16";
import { situacaoDaAcao, prioridadeDoTema } from "@/domain/gestao";
import { FRAMEWORKS, TIPOS_DE_RELATORIO, type DadosDoRelatorio } from "@/domain/relatorio";
import { auditar, comoUsuario, type Sql } from "../db.server";
import { ErroDeNegocio } from "../erros";
import { eventoVisivel } from "./eventos.server";
import { lerAcoes, lerChecklist, lerMedidas } from "./gestao.server";
import { lerFicha } from "./governanca.server";
import { lerInventario } from "./inventario.server";
import { obterPosEventoNaTransacao } from "./posEvento.server";

const uuid = z.string().uuid();

/** JSON com as chaves em ordem: o mesmo conteúdo sempre dá o mesmo código. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export const codigoDeIntegridade = (dados: unknown) =>
  createHash("sha256").update(canonico(dados)).digest("hex");

async function montarDados(sql: Sql, eventoId: string, hoje: string): Promise<DadosDoRelatorio> {
  const pos = await obterPosEventoNaTransacao(sql, eventoId);
  const ev = pos.evento;
  const post = await lerInventario(sql, eventoId, "ex_post");
  const ficha = await lerFicha(sql, eventoId);
  const medidas = await lerMedidas(sql, eventoId);
  const exAnte = pos.exAnte.existe
    ? Object.fromEntries(pos.resultados.categorias.map((c) => [c.categoria, c.exAnte ?? 0]))
    : null;
  const exPost = Object.fromEntries(pos.resultados.categorias.map((c) => [c.categoria, c.exPost]));
  const reducao = calcularReducao(medidas, exAnte, exPost, ev.nivel);
  const temas = await sql<{
    tema: string;
    categoria: string | null;
    impacto: number;
    relevancia: number;
    stakeholders: string | null;
  }>(
    `select tema, categoria, impacto, relevancia, stakeholders from matriz_temas
     where evento_id = $1 order by impacto + relevancia desc, lower(tema)`,
    [eventoId],
  );
  const acoes = await lerAcoes(sql, eventoId);
  const ocorrencias = await sql<DadosDoRelatorio["ocorrencias"][number]>(
    `select to_char(data, 'YYYY-MM-DD') as data, fase, categoria, ocorrencia, impacto, acao, responsavel,
            situacao, premissa
     from ocorrencias where evento_id = $1 order by data nulls last, criado_em`,
    [eventoId],
  );
  const [forn] = await sql<{ total: number; recebidos: number }>(
    `select count(*)::int as total, count(recebido_em)::int as recebidos from fornecedores where evento_id = $1`,
    [eventoId],
  );
  const checklist = await lerChecklist(sql, ev);
  const base = post.baseCompleta;
  const frase = fraseAutorizada({
    totalExPost: pos.resultados.principais.total,
    aCompensar: pos.saldo.aCompensar,
    aposentada: pos.compensacao.aposentadaT ?? 0,
    situacaoPrimario: pos.resultados.qualidade.situacaoPrimario,
  });
  const { versao: _v, ...compensacao } = pos.compensacao;
  return {
    modelo: 1,
    metodologia: ev.metodologia,
    evento: {
      nome: ev.nome,
      instituicao: ev.instituicao,
      cidade: ev.cidade,
      uf: ev.uf,
      dataInicio: ev.dataInicio,
      dataFim: ev.dataFim,
      nivel: ev.nivel,
      designacao: ev.nivel ? designacao(ev.nivel as Nivel) : null,
      responsavel: ficha.dados.responsavelGestaoClimatica,
      alegacaoPretendida: ficha.dados.alegacao,
    },
    base: {
      nome: base.nome,
      referenciaGwp: base.referenciaGwp,
      gwpCh4: base.gwpCh4,
      gwpN2o: base.gwpN2o,
      ano: post.ano,
      avisoSin: post.resultado.avisoSin,
    },
    publico: pos.publico,
    exAnte: pos.exAnte.existe
      ? { fechadoEm: pos.exAnte.fechadoEm, total: pos.comparacao.total.exAnte }
      : null,
    exPost: { fechadoEm: pos.exPost.fechadoEm, pendencias: pos.exPost.pendencias },
    resultados: pos.resultados,
    comparacao: pos.exAnte.existe ? pos.comparacao : null,
    compensacao: { ...compensacao, ...pos.saldo },
    frase,
    avisoAlegacao: avisoDaAlegacao(ficha.dados.alegacao, frase),
    memoria: memoriaDeCalculo(post.linhas, post.resultado, base, post.ano),
    reducao: {
      exigencia: reducao.exigencia,
      conferencia: reducao.conferencia,
      medidas: medidas.map((m, i) => ({
        categoria: m.categoria,
        acao: m.acao,
        objetivo: m.objetivo,
        metaPct: m.metaPct,
        metaT: reducao.linhas[i]?.metaT ?? null,
        responsavel: m.responsavel,
        prazo: m.prazo,
        resultado: m.resultado,
        evidencia: m.evidencia,
      })),
    },
    temas: temas.map((t) => ({ ...t, prioridade: prioridadeDoTema(t.impacto, t.relevancia) })),
    acoes: acoes.map((a) => ({
      acao: a.acao,
      responsavel: a.responsavel,
      prazo: a.prazo,
      situacao: situacaoDaAcao(a, hoje),
      progresso: a.progresso,
    })),
    ocorrencias,
    fornecedores: { total: forn?.total ?? 0, recebidos: forn?.recebidos ?? 0 },
    checklist: checklist.map((f) => ({
      nome: f.nome,
      itens: f.itens.length,
      progresso: f.progresso,
      concluida: f.concluida,
    })),
  };
}

export interface RelatorioListado {
  id: string;
  numero: number;
  tipo: (typeof TIPOS_DE_RELATORIO)[number];
  framework: (typeof FRAMEWORKS)[number];
  hash: string;
  geradoPor: string;
  geradoEm: string;
  total: number;
  frase: string;
}

export async function listarRelatorios(atorId: string, eventoId: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const lista = await sql<RelatorioListado>(
      `select r.id::text, r.numero, r.tipo, r.framework, r.hash, u.nome as "geradoPor",
              to_char(r.gerado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "geradoEm",
              (r.dados #>> '{resultados,principais,total}')::double precision as total,
              r.dados ->> 'frase' as frase
       from relatorios r join usuarios u on u.id = r.gerado_por
       where r.evento_id = $1 order by r.numero desc`,
      [evento.id],
    );
    return { evento, lista };
  });
}

export async function obterRelatorio(atorId: string, eventoId: string, id: string) {
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, uuid.parse(eventoId));
    const [r] = await sql<Omit<RelatorioListado, "total" | "frase"> & { dados: DadosDoRelatorio }>(
      `select r.id::text, r.numero, r.tipo, r.framework, r.hash, r.dados, u.nome as "geradoPor",
              to_char(r.gerado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "geradoEm"
       from relatorios r join usuarios u on u.id = r.gerado_por
       where r.id = $1 and r.evento_id = $2`,
      [uuid.parse(id), evento.id],
    );
    if (!r) throw new ErroDeNegocio("Relatório não encontrado.");
    return { evento, ...r, integro: codigoDeIntegridade(r.dados) === r.hash };
  });
}

export const gerarRelatorioSchema = z.object({
  eventoId: z.string().uuid(),
  tipo: z.enum(TIPOS_DE_RELATORIO),
  framework: z.enum(FRAMEWORKS),
  hoje: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function gerarRelatorio(
  atorId: string,
  entrada: z.input<typeof gerarRelatorioSchema>,
) {
  const d = gerarRelatorioSchema.parse(entrada);
  return comoUsuario(atorId, async (sql) => {
    const evento = await eventoVisivel(sql, d.eventoId);
    if (!evento.podeEditar) throw new ErroDeNegocio("Seu papel neste evento é só de consulta.");
    if (d.tipo === "final" && !evento.podeGerir)
      throw new ErroDeNegocio("Apenas o gestor do evento gera o relatório final.");
    const dados = await montarDados(sql, evento.id, d.hoje);
    if (d.tipo === "final" && !dados.exPost.fechadoEm)
      throw new ErroDeNegocio("O relatório final exige o inventário ex-post fechado.");
    const hash = codigoDeIntegridade(dados);
    const [r] = await sql<{ id: string; numero: number }>(
      `insert into relatorios (evento_id, numero, tipo, framework, dados, hash, gerado_por)
       values ($1, (select coalesce(max(numero), 0) + 1 from relatorios where evento_id = $1), $2, $3, $4, $5, $6)
       returning id::text, numero`,
      [evento.id, d.tipo, d.framework, JSON.stringify(dados), hash, atorId],
    );
    await auditar(sql, {
      usuarioId: atorId,
      eventoId: evento.id,
      acao: "gerar_relatorio",
      entidade: "relatorio",
      entidadeId: r!.id,
      detalhes: { numero: r!.numero, tipo: d.tipo, framework: d.framework, hash },
    });
    return { id: r!.id, numero: r!.numero };
  });
}
