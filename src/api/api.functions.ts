/**
 * Funções de servidor chamadas pela interface. Todas exigem sessão
 * (`autenticado`) e só repassam para os serviços, que validam a entrada,
 * conferem a permissão e gravam com RLS. O middleware traduz os erros em
 * mensagens seguras.
 */
import { createServerFn } from "@tanstack/react-start";
import type { z } from "zod";
import { autenticado } from "./middleware";
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
import type { DadosDoEvento } from "@/domain/evento";

const post = () => createServerFn({ method: "POST" }).middleware([autenticado]);

// Sessão e usuários ----------------------------------------------------

export const minhaSessao = post().handler(({ context }) => sincronizarSessao(context.usuarioId));

export const usuariosListar = post().handler(({ context }) => listarUsuarios(context.usuarioId));

export const usuarioRegistrar = post()
  .inputValidator((d: z.input<typeof novaContaSchema>) => d)
  .handler(({ context, data }) => registrarConta(context.usuarioId, data));

export const usuarioAlterar = post()
  .inputValidator((d: z.input<typeof alteracaoDeUsuarioSchema>) => d)
  .handler(({ context, data }) => alterarUsuario(context.usuarioId, data));

// Eventos e equipe -----------------------------------------------------

export const eventosListar = post()
  .inputValidator((d: { incluirArquivados?: boolean }) => d)
  .handler(({ context, data }) =>
    listarEventos(context.usuarioId, data.incluirArquivados === true),
  );

export const eventoObter = post()
  .inputValidator((d: { id: string }) => d)
  .handler(({ context, data }) => obterEvento(context.usuarioId, data.id));

export const eventoCriar = post()
  .inputValidator((d: DadosDoEvento & { gestorId: string }) => d)
  .handler(({ context, data }) => criarEvento(context.usuarioId, data));

export const eventoAtualizar = post()
  .inputValidator((d: { id: string; dados: DadosDoEvento }) => d)
  .handler(({ context, data }) => atualizarEvento(context.usuarioId, data.id, data.dados));

export const eventoArquivar = post()
  .inputValidator((d: { id: string; arquivar: boolean }) => d)
  .handler(({ context, data }) =>
    arquivarEvento(context.usuarioId, data.id, data.arquivar === true),
  );

export const equipeListar = post()
  .inputValidator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarEquipe(context.usuarioId, data.eventoId));

export const equipeAdicionar = post()
  .inputValidator((d: z.input<typeof membroSchema>) => d)
  .handler(({ context, data }) => adicionarMembro(context.usuarioId, data));

export const equipeRemover = post()
  .inputValidator((d: { eventoId: string; usuarioId: string }) => d)
  .handler(({ context, data }) => removerMembro(context.usuarioId, data.eventoId, data.usuarioId));

// Governança: caracterização, enquadramento e acompanhamento -----------

export const fichaObter = post()
  .inputValidator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterFicha(context.usuarioId, data.eventoId));

export const fichaSalvar = post()
  .inputValidator((d: z.input<typeof salvarFichaSchema>) => d)
  .handler(({ context, data }) => salvarFicha(context.usuarioId, data));

export const enquadramentoConfirmar = post()
  .inputValidator((d: z.input<typeof confirmarSchema>) => d)
  .handler(({ context, data }) => confirmarEnquadramento(context.usuarioId, data));

export const enquadramentosListar = post()
  .inputValidator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => listarEnquadramentos(context.usuarioId, data.eventoId));

export const acompanhamentoObter = post()
  .inputValidator((d: { eventoId: string }) => d)
  .handler(({ context, data }) => obterAcompanhamento(context.usuarioId, data.eventoId));

export const requisitoMarcar = post()
  .inputValidator((d: z.input<typeof marcarRequisitoSchema>) => d)
  .handler(({ context, data }) => marcarRequisito(context.usuarioId, data));

export const auditoriaListar = post()
  .inputValidator((d: { eventoId: string | null }) => d)
  .handler(({ context, data }) => listarAuditoria(context.usuarioId, data.eventoId ?? null));
