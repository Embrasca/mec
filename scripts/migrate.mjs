// Aplica as migrações de `migrations/` em ordem, uma vez cada.
// Uso: DATABASE_URL=postgres://... npm run db:migrate
// Use a conexão do DONO do banco (no Neon, o papel criado com o projeto).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL.");
  process.exit(1);
}

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const pool = new Pool({ connectionString: url, max: 1 });
const client = await pool.connect();
try {
  await client.query(
    "create table if not exists schema_migrations (nome text primary key, aplicada_em timestamptz not null default now())",
  );
  const feitas = new Set(
    (await client.query("select nome from schema_migrations")).rows.map((r) => r.nome),
  );
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql")).sort();
  for (const arquivo of arquivos) {
    if (feitas.has(arquivo)) continue;
    const sqlText = await readFile(path.join(pasta, arquivo), "utf8");
    await client.query("begin");
    try {
      await client.query(sqlText);
      await client.query("insert into schema_migrations (nome) values ($1)", [arquivo]);
      await client.query("commit");
      console.log("aplicada:", arquivo);
    } catch (erro) {
      await client.query("rollback");
      console.error("falhou:", arquivo);
      throw erro;
    }
  }
  console.log("Banco atualizado.");
} finally {
  client.release();
  await pool.end();
}
