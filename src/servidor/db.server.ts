/**
 * Acesso ao banco (Neon Postgres).
 *
 * Toda operação feita em nome de alguém passa por `comoUsuario`: abre uma
 * transação, troca para o papel `mec_app` (sujeito às regras de RLS) e informa
 * quem está agindo em `app.user_id`. Assim o banco confere o acesso mesmo que
 * uma checagem falte no código.
 *
 * `comoSistema` roda com o dono do banco, sem RLS. Fica restrito a poucos usos
 * marcados: sincronizar o perfil no login e conferir contas no Neon Auth.
 */
import { Pool, type PoolClient } from "@neondatabase/serverless";

export type Sql = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

/** Abstração mínima de transação, para trocar o Neon pelo PGlite nos testes. */
export interface Driver {
  transacao<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
}

let driverDeTeste: Driver | null = null;

/** Só para testes: troca o banco por um em memória. */
export function usarDriver(d: Driver | null) {
  driverDeTeste = d;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O Neon suspende o banco ocioso; a primeira conexão pode falhar enquanto ele
// acorda. Só a conexão é repetida: nada foi executado ainda, não há risco de
// gravar duas vezes.
const ESPERAS_AO_CONECTAR_MS = [400, 1200];

async function conectar(pool: Pool): Promise<PoolClient> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await pool.connect();
    } catch (erro) {
      const espera = ESPERAS_AO_CONECTAR_MS[tentativa];
      if (espera === undefined) throw erro;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
}

const driverNeon: Driver = {
  async transacao(fn) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("Banco não configurado: defina DATABASE_URL no servidor.");
    // Um pool por operação: funciona igual em Node e em runtime de Worker, onde
    // conexões não podem atravessar pedidos.
    const pool = new Pool({ connectionString: url, max: 1 });
    const client = await conectar(pool);
    try {
      await client.query("begin");
      const sql: Sql = async (text, params) => (await client.query(text, params)).rows as never;
      const resultado = await fn(sql);
      await client.query("commit");
      return resultado;
    } catch (erro) {
      await client.query("rollback").catch(() => undefined);
      throw erro;
    } finally {
      client.release();
      await pool.end().catch(() => undefined);
    }
  },
};

const driver = () => driverDeTeste ?? driverNeon;

export function comoUsuario<T>(usuarioId: string, fn: (sql: Sql) => Promise<T>): Promise<T> {
  if (!UUID.test(usuarioId)) return Promise.reject(new Error("Usuário inválido."));
  return driver().transacao(async (sql) => {
    await sql("set local role mec_app");
    await sql("select set_config('app.user_id', $1, true)", [usuarioId]);
    return fn(sql);
  });
}

export function comoSistema<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  return driver().transacao(fn);
}

/** Registra na trilha de auditoria, dentro da mesma transação da alteração. */
export async function auditar(
  sql: Sql,
  e: {
    usuarioId: string;
    eventoId?: string | null;
    acao: string;
    entidade: string;
    entidadeId?: string | null;
    detalhes?: unknown;
  },
) {
  await sql(
    `insert into auditoria (usuario_id, evento_id, acao, entidade, entidade_id, detalhes)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      e.usuarioId,
      e.eventoId ?? null,
      e.acao,
      e.entidade,
      e.entidadeId ?? null,
      e.detalhes === undefined ? null : JSON.stringify(e.detalhes),
    ],
  );
}
