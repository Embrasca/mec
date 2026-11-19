/**
 * Funções de servidor chamadas pela interface. Todas exigem sessão
 * (`autenticado`) e só repassam para os serviços, que validam a entrada,
 * conferem a permissão e gravam com RLS. O middleware traduz os erros em
 * mensagens seguras.
 */
import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import { autenticado, publico } from "./middleware";
import { obterPainel, salvarMeta, removerMeta } from "@/servidor/servicos/painel.server";
import type { salvarMetaSchema } from "@/servidor/servicos/painel.server";
import {
  obterEsg,
  salvarItem,
  removerItem,
  salvarFornecedorEsg,
  salvarRegistro,
  configurarPesquisa,
  importarRespostasDaPesquisa,
  desfazerImportacao,
  destacarComentario,
  obterPesquisaPublica,
  responderPesquisa,
  enviarAnexo,
  baixarAnexo,
  removerAnexo,
} from "@/servidor/servicos/esg.server";
import type {
  salvarItemSchema,
  salvarFornecedorEsgSchema,
  salvarRegistroSchema,
  configurarPesquisaSchema,
  importarSchema,
  responderSchema,
  enviarAnexoSchema,
} from "@/servidor/servicos/esg.server";
import {
  listarRelatorios,
  obterRelatorio,
  gerarRelatorio,
} from "@/servidor/servicos/relatorios.server";
import type { gerarRelatorioSchema } from "@/servidor/servicos/relatorios.server";
import {
  listarOcorrencias,
  salvarOcorrencia,
  removerOcorrencia,
  obterPosEvento,
  salvarDesvio,
  salvarCompensacao,
} from "@/servidor/servicos/posEvento.server";
import type {
  salvarOcorrenciaSchema,
  salvarDesvioSchema,
  salvarCompensacaoSchema,
} from "@/servidor/servicos/posEvento.server";
import {
  sincronizarSessao,
  listarUsuarios,
  registrarConta,
  alterarUsuario,
} from "@/servidor/servicos/usuarios.server";
import type {
  novaContaSchema,
  alteracaoDeUsuarioSchema,
} from "@/servidor/servicos/usuarios.server";
import {
  listarEventos,
  obterEvento,
  criarEvento,
  atualizarEvento,
  arquivarEvento,
  listarEquipe,
  adicionarMembro,
  removerMembro,
} from "@/servidor/servicos/eventos.server";
import type { membroSchema } from "@/servidor/servicos/eventos.server";
import {
  obterFicha,
  salvarFicha,
  confirmarEnquadramento,
  listarEnquadramentos,
  obterAcompanhamento,
  marcarRequisito,
  listarAuditoria,
} from "@/servidor/servicos/governanca.server";
import type {
  salvarFichaSchema,
  confirmarSchema,
  marcarRequisitoSchema,
} from "@/servidor/servicos/governanca.server";
import {
  listarBases,
  obterBase,
  criarVersaoDaBase,
  alterarFator,
  definirFatorSin,
  publicarBase,
  excluirRascunho,
  definirBaseDoEvento,
  obterInventario,
  salvarInventario,
  fecharInventario,
  obterColeta,
  salvarColeta,
  lancarColetaNoInventario,
  listarFornecedores,
  salvarFornecedor,
  removerFornecedor,
} from "@/servidor/servicos/inventario.server";
import type {
  novaVersaoSchema,
  alteracaoDeFatorSchema,
  sinSchema,
  salvarInventarioSchema,
  salvarColetaSchema,
  salvarFornecedorSchema,
} from "@/servidor/servicos/inventario.server";
import {
  obterChecklist,
  marcarItemDoChecklist,
  obterPlanoDeReducao,
  salvarMedida,
  listarTemas,
  salvarTema,
  listarAcoes,
  salvarAcao,
  removerItemDeGestao,
  obterLinhaDoTempo,
} from "@/servidor/servicos/gestao.server";
import type {
  marcarItemSchema,
  salvarMedidaSchema,
  salvarTemaSchema,
  salvarAcaoSchema,
} from "@/servidor/servicos/gestao.server";
import type { DadosDoEvento } from "@/domain/evento";

// Sessão e usuários ----------------------------------------------------

export const minhaSessao = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .handler(({ context }) => sincronizarSessao(context.usuarioId));

export const usuariosListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .handler(({ context }) => listarUsuarios(context.usuarioId));

export const usuarioRegistrar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof novaContaSchema>) => d)
  .handler(({ context, data }) => registrarConta(context.usuarioId, data));

export const usuarioAlterar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof alteracaoDeUsuarioSchema>) => d)
  .handler(({ context, data }) => alterarUsuario(context.usuarioId, data));

// Eventos e equipe -----------------------------------------------------

export const eventosListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { incluirArquivados?: boolean }) => d)
  .handler(({ context, data }) =>
    listarEventos(context.usuarioId, data.incluirArquivados === true),
  );

export const eventoObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string }) => d)
  .handler(({ context, data }) => obterEvento(context.usuarioId, data.id));

export const eventoCriar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: DadosDoEvento & { gestorId: string }) => d)
  .handler(({ context, data }) => criarEvento(context.usuarioId, data));

export const eventoAtualizar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string; dados: DadosDoEvento }) => d)
  .handler(({ context, data }) => atualizarEvento(context.usuarioId, data.id, data.dados));

export const eventoArquivar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string; arquivar: boolean }) => d)
  .handler(({ context, data }) =>
    arquivarEvento(context.usuarioId, data.id, data.arquivar === true),
  );

export const equipeListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarEquipe(context.usuarioId, data.eventoId));

export const equipeAdicionar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof membroSchema>) => d)
  .handler(({ context, data }) => adicionarMembro(context.usuarioId, data));

export const equipeRemover = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; usuarioId: string }) => d)
  .handler(({ context, data }) => removerMembro(context.usuarioId, data.eventoId, data.usuarioId));

// Governança: caracterização, enquadramento e acompanhamento -----------

export const fichaObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterFicha(context.usuarioId, data.eventoId));

export const fichaSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarFichaSchema>) => d)
  .handler(({ context, data }) => salvarFicha(context.usuarioId, data));

export const enquadramentoConfirmar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof confirmarSchema>) => d)
  .handler(({ context, data }) => confirmarEnquadramento(context.usuarioId, data));

export const enquadramentosListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarEnquadramentos(context.usuarioId, data.eventoId));

export const acompanhamentoObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterAcompanhamento(context.usuarioId, data.eventoId));

export const requisitoMarcar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof marcarRequisitoSchema>) => d)
  .handler(({ context, data }) => marcarRequisito(context.usuarioId, data));

export const auditoriaListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string | null }) => d)
  .handler(({ context, data }) => listarAuditoria(context.usuarioId, data.eventoId ?? null));

// Etapa 2: base de fatores, inventário, coleta e fornecedores ----------

export const basesListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .handler(({ context }) => listarBases(context.usuarioId));

export const baseObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string }) => d)
  .handler(({ context, data }) => obterBase(context.usuarioId, data.id));

export const baseCriarVersao = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof novaVersaoSchema>) => d)
  .handler(({ context, data }) => criarVersaoDaBase(context.usuarioId, data));

export const fatorAlterar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof alteracaoDeFatorSchema>) => d)
  .handler(({ context, data }) => alterarFator(context.usuarioId, data));

export const fatorSinDefinir = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof sinSchema>) => d)
  .handler(({ context, data }) => definirFatorSin(context.usuarioId, data));

export const basePublicar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string }) => d)
  .handler(({ context, data }) => publicarBase(context.usuarioId, data.id));

export const baseExcluirRascunho = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string }) => d)
  .handler(({ context, data }) => excluirRascunho(context.usuarioId, data.id));

export const eventoDefinirBase = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; baseId: string }) => d)
  .handler(({ context, data }) =>
    definirBaseDoEvento(context.usuarioId, data.eventoId, data.baseId),
  );

export const inventarioObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; etapa: "ex_ante" | "ex_post" }) => d)
  .handler(({ context, data }) => obterInventario(context.usuarioId, data.eventoId, data.etapa));

export const inventarioSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarInventarioSchema>) => d)
  .handler(({ context, data }) => salvarInventario(context.usuarioId, data));

export const inventarioFechar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; etapa: "ex_ante" | "ex_post"; versao: number }) => d)
  .handler(({ context, data }) =>
    fecharInventario(context.usuarioId, data.eventoId, data.etapa, data.versao),
  );

export const coletaObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; etapa: "ex_ante" | "ex_post" }) => d)
  .handler(({ context, data }) => obterColeta(context.usuarioId, data.eventoId, data.etapa));

export const coletaSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarColetaSchema>) => d)
  .handler(({ context, data }) => salvarColeta(context.usuarioId, data));

export const coletaLancar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; etapa: "ex_ante" | "ex_post" }) => d)
  .handler(({ context, data }) =>
    lancarColetaNoInventario(context.usuarioId, data.eventoId, data.etapa),
  );

export const fornecedoresListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; hoje: string }) => d)
  .handler(({ context, data }) => listarFornecedores(context.usuarioId, data.eventoId, data.hoje));

export const fornecedorSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarFornecedorSchema>) => d)
  .handler(({ context, data }) => salvarFornecedor(context.usuarioId, data));

export const fornecedorRemover = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; id: string }) => d)
  .handler(({ context, data }) => removerFornecedor(context.usuarioId, data.eventoId, data.id));

// Etapa 3: checklist, plano de redução, matriz, plano de ação e linha do tempo

export const checklistObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterChecklist(context.usuarioId, data.eventoId));

export const checklistMarcar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof marcarItemSchema>) => d)
  .handler(({ context, data }) => marcarItemDoChecklist(context.usuarioId, data));

export const reducaoObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterPlanoDeReducao(context.usuarioId, data.eventoId));

export const medidaSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarMedidaSchema>) => d)
  .handler(({ context, data }) => salvarMedida(context.usuarioId, data));

export const temasListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarTemas(context.usuarioId, data.eventoId));

export const temaSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarTemaSchema>) => d)
  .handler(({ context, data }) => salvarTema(context.usuarioId, data));

export const acoesListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; hoje: string }) => d)
  .handler(({ context, data }) => listarAcoes(context.usuarioId, data.eventoId, data.hoje));

export const acaoSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarAcaoSchema>) => d)
  .handler(({ context, data }) => salvarAcao(context.usuarioId, data));

export const gestaoRemover = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; tipo: "medida" | "tema" | "acao"; id: string }) => d)
  .handler(({ context, data }) =>
    removerItemDeGestao(context.usuarioId, data.eventoId, data.tipo, data.id),
  );

export const linhaDoTempoObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; hoje: string }) => d)
  .handler(({ context, data }) => obterLinhaDoTempo(context.usuarioId, data.eventoId, data.hoje));

// Etapa 4: execução e pós-evento

export const ocorrenciasListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarOcorrencias(context.usuarioId, data.eventoId));

export const ocorrenciaSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarOcorrenciaSchema>) => d)
  .handler(({ context, data }) => salvarOcorrencia(context.usuarioId, data));

export const ocorrenciaRemover = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; id: string }) => d)
  .handler(({ context, data }) => removerOcorrencia(context.usuarioId, data.eventoId, data.id));

export const posEventoObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterPosEvento(context.usuarioId, data.eventoId));

export const desvioSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarDesvioSchema>) => d)
  .handler(({ context, data }) => salvarDesvio(context.usuarioId, data));

export const compensacaoSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarCompensacaoSchema>) => d)
  .handler(({ context, data }) => salvarCompensacao(context.usuarioId, data));

// Etapa 5: relatórios

export const relatoriosListar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarRelatorios(context.usuarioId, data.eventoId));

export const relatorioObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; id: string }) => d)
  .handler(({ context, data }) => obterRelatorio(context.usuarioId, data.eventoId, data.id));

export const relatorioGerar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof gerarRelatorioSchema>) => d)
  .handler(({ context, data }) => gerarRelatorio(context.usuarioId, data));

// Etapa 6: ESG além do GEE

export const esgObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterEsg(context.usuarioId, data.eventoId));

export const esgSalvarItem = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarItemSchema>) => d)
  .handler(({ context, data }) => salvarItem(context.usuarioId, data));

export const esgRemoverItem = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator(
    (d: { eventoId: string; lista: "equipe" | "material" | "acao_social"; id: string }) => d,
  )
  .handler(({ context, data }) =>
    removerItem(context.usuarioId, data.eventoId, data.lista, data.id),
  );

export const esgSalvarFornecedor = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarFornecedorEsgSchema>) => d)
  .handler(({ context, data }) => salvarFornecedorEsg(context.usuarioId, data));

export const esgSalvarRegistro = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarRegistroSchema>) => d)
  .handler(({ context, data }) => salvarRegistro(context.usuarioId, data));

export const pesquisaConfigurar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof configurarPesquisaSchema>) => d)
  .handler(({ context, data }) => configurarPesquisa(context.usuarioId, data));

export const pesquisaImportar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof importarSchema>) => d)
  .handler(({ context, data }) => importarRespostasDaPesquisa(context.usuarioId, data));

export const pesquisaDesfazerImportacao = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; importacaoId: string }) => d)
  .handler(({ context, data }) =>
    desfazerImportacao(context.usuarioId, data.eventoId, data.importacaoId),
  );

export const pesquisaDestacar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; respostaId: string; destaque: boolean }) => d)
  .handler(({ context, data }) =>
    destacarComentario(context.usuarioId, data.eventoId, data.respostaId, data.destaque),
  );

export const pesquisaPublicaObter = createServerFn({ method: "POST" })
  .middleware([publico])
  .validator((d: { token: string }) => d)
  .handler(({ data }) => obterPesquisaPublica(data.token));

export const pesquisaPublicaResponder = createServerFn({ method: "POST" })
  .middleware([publico])
  .validator((d: z.input<typeof responderSchema>) => d)
  .handler(({ data }) => responderPesquisa(data));

export const anexoEnviar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof enviarAnexoSchema>) => d)
  .handler(({ context, data }) => enviarAnexo(context.usuarioId, data));

export const anexoBaixar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; id: string }) => d)
  .handler(({ context, data }) => baixarAnexo(context.usuarioId, data.eventoId, data.id));

export const anexoRemover = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { eventoId: string; id: string }) => d)
  .handler(({ context, data }) => removerAnexo(context.usuarioId, data.eventoId, data.id));

// Etapa 7: painel gerencial

export const painelObter = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { hoje: string }) => d)
  .handler(({ context, data }) => obterPainel(context.usuarioId, data.hoje));

export const metaSalvar = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: z.input<typeof salvarMetaSchema>) => d)
  .handler(({ context, data }) => salvarMeta(context.usuarioId, data));

export const metaRemover = createServerFn({ method: "POST" })
  .middleware([autenticado])
  .validator((d: { id: string }) => d)
  .handler(({ context, data }) => removerMeta(context.usuarioId, data.id));
