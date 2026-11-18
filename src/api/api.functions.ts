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
