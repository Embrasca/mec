/**
 * Postgres em memória (PGlite) com as migrações reais aplicadas, para testar
 * regras de negócio e RLS sem depender do Neon.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { usarDriver, type Driver, type Sql } from "../db.server";

const PASTA = path.resolve(__dirname, "../../../migrations");

export async function criarBancoDeTeste() {
  const db = new PGlite();
  // O Neon Auth cria esta tabela no projeto real; aqui ela é simulada.
  await db.exec(`
    create schema neon_auth;
    create table neon_auth."user" (id uuid primary key, name text, email text not null, banned boolean);
  `);
  for (const arquivo of readdirSync(PASTA)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(path.join(PASTA, arquivo), "utf8"));
  }
  const driver: Driver = {
    transacao: (fn) =>
      db.transaction(async (tx) => {
        const sql: Sql = async (text, params) => (await tx.query(text, params ?? [])).rows as never;
        return fn(sql);
      }),
  };
  usarDriver(driver);

  /** Cria a conta no "Neon Auth" e, se pedido, o registro na plataforma. */
  async function conta(nome: string, opcoes: { admin?: boolean; registrar?: boolean } = {}) {
    const id = crypto.randomUUID();
    const email = `${nome.toLowerCase()}@exemplo.org`;
    await db.query(`insert into neon_auth."user" (id, name, email) values ($1, $2, $3)`, [
      id,
      nome,
      email,
    ]);
    if (opcoes.registrar !== false)
      await db.query(
        "insert into usuarios (id, email, nome, admin_plataforma) values ($1, $2, $3, $4)",
        [id, email, nome, opcoes.admin ?? false],
      );
    return { id, email };
  }

  return { db, conta, fechar: () => db.close() };
}
