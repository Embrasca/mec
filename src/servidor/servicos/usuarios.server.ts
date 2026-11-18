import { z } from "zod";
import { auditar, comoSistema, comoUsuario } from "../db.server";
import { ErroDeNegocio } from "../erros";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  adminPlataforma: boolean;
}

interface ContaNoNeonAuth {
  id: string;
  name: string | null;
  email: string;
}

/** Conta no provedor de identidade (Neon Auth), lida com o dono do banco. */
async function contaNoNeonAuth(id: string): Promise<ContaNoNeonAuth | null> {
  const [conta] = await comoSistema((sql) =>
    sql<ContaNoNeonAuth>(
      `select id::text as id, name, email from neon_auth."user"
       where id = $1::uuid and coalesce(banned, false) = false`,
      [id],
    ),
  );
  return conta ?? null;
}

/**
 * Chamada a cada entrada no sistema. Cria o registro da pessoa na primeira vez
 * (sem nenhum acesso: quem dá acesso é a administração ou o gestor do evento)
 * e mantém o e-mail igual ao do provedor de identidade.
 */
export async function sincronizarSessao(usuarioId: string): Promise<Perfil> {
  const conta = await contaNoNeonAuth(usuarioId);
  if (!conta) throw new ErroDeNegocio("Conta não encontrada ou bloqueada.");
  const nome = (conta.name ?? "").trim() || conta.email;
  const [perfil] = await comoSistema((sql) =>
    sql<{ id: string; nome: string; email: string; admin_plataforma: boolean; ativo: boolean }>(
      `insert into usuarios (id, email, nome) values ($1, $2, $3)
       on conflict (id) do update set email = excluded.email
       returning id::text, nome, email, admin_plataforma, ativo`,
      [conta.id, conta.email, nome.slice(0, 200)],
    ),
  );
  if (!perfil?.ativo)
    throw new ErroDeNegocio("Esta conta está desativada. Fale com a administração.");
  return {
    id: perfil.id,
    nome: perfil.nome,
    email: perfil.email,
    adminPlataforma: perfil.admin_plataforma,
  };
}

export interface UsuarioListado {
  id: string;
  nome: string;
  email: string;
  adminPlataforma: boolean;
  ativo: boolean;
  eventos: number;
}

export async function listarUsuarios(atorId: string): Promise<UsuarioListado[]> {
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    return sql<UsuarioListado>(
      `select u.id::text, u.nome, u.email, u.admin_plataforma as "adminPlataforma", u.ativo,
              (select count(*)::int from evento_membros m where m.usuario_id = u.id) as eventos
       from usuarios u order by u.ativo desc, lower(u.nome)`,
    );
  });
}

export const novaContaSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(200),
  nome: z.string().trim().min(1).max(200),
  adminPlataforma: z.boolean(),
});

/**
 * Registra na plataforma uma conta recém-criada no Neon Auth. O id e o e-mail
 * são conferidos no provedor, para ninguém registrar uma conta que não existe.
 */
export async function registrarConta(atorId: string, entrada: z.infer<typeof novaContaSchema>) {
  const dados = novaContaSchema.parse(entrada);
  const conta = await contaNoNeonAuth(dados.id);
  if (!conta || conta.email.toLowerCase() !== dados.email)
    throw new ErroDeNegocio("A conta não foi encontrada no provedor de identidade.");
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    await sql(
      `insert into usuarios (id, email, nome, admin_plataforma) values ($1, $2, $3, $4)
       on conflict (id) do update set nome = excluded.nome, admin_plataforma = excluded.admin_plataforma`,
      [dados.id, dados.email, dados.nome, dados.adminPlataforma],
    );
    await auditar(sql, {
      usuarioId: atorId,
      acao: "registrar_conta",
      entidade: "usuario",
      entidadeId: dados.id,
      detalhes: { email: dados.email, adminPlataforma: dados.adminPlataforma },
    });
    return { id: dados.id };
  });
}

export const alteracaoDeUsuarioSchema = z.object({
  id: z.string().uuid(),
  adminPlataforma: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

export async function alterarUsuario(
  atorId: string,
  entrada: z.infer<typeof alteracaoDeUsuarioSchema>,
) {
  const dados = alteracaoDeUsuarioSchema.parse(entrada);
  if (dados.id === atorId && (dados.adminPlataforma === false || dados.ativo === false))
    throw new ErroDeNegocio("Você não pode tirar o seu próprio acesso de administração.");
  return comoUsuario(atorId, async (sql) => {
    await exigirAdmin(sql);
    const [linha] = await sql<{ id: string }>(
      `update usuarios set
         admin_plataforma = coalesce($2, admin_plataforma),
         ativo = coalesce($3, ativo),
         atualizado_em = now()
       where id = $1 returning id::text`,
      [dados.id, dados.adminPlataforma ?? null, dados.ativo ?? null],
    );
    if (!linha) throw new ErroDeNegocio("Usuário não encontrado.");
    await auditar(sql, {
      usuarioId: atorId,
      acao: "alterar_usuario",
      entidade: "usuario",
      entidadeId: dados.id,
      detalhes: { adminPlataforma: dados.adminPlataforma, ativo: dados.ativo },
    });
    return { ok: true };
  });
}

export async function exigirAdmin(sql: import("../db.server").Sql) {
  const [r] = await sql<{ admin: boolean }>("select app.eh_admin() as admin");
  if (!r?.admin) throw new ErroDeNegocio("Apenas a administração da plataforma pode fazer isso.");
}
