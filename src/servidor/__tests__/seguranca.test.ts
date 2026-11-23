/**
 * Regras de segurança que valem para o banco inteiro, inclusive para
 * migrações futuras: se uma tabela nova esquecer a RLS, este teste falha.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarDriver } from "../db.server";
import { criarBancoDeTeste } from "./banco-de-teste";

let banco: Awaited<ReturnType<typeof criarBancoDeTeste>>;

beforeAll(async () => {
  banco = await criarBancoDeTeste();
});

afterAll(async () => {
  usarDriver(null);
  await banco.fechar();
});

const linhas = async <T>(sql: string) => (await banco.db.query<T>(sql)).rows;

describe("banco", () => {
  it("toda tabela do esquema público tem RLS ligada", async () => {
    const semRls = await linhas<{ tabela: string }>(
      `select c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
         and c.relname <> 'schema_migrations'`,
    );
    expect(semRls).toEqual([]);
  });

  it("o papel da aplicação não ignora a RLS e não é dono de nada", async () => {
    const [papel] = await linhas<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "select rolbypassrls, rolsuper from pg_roles where rolname = 'mec_app'",
    );
    expect(papel).toEqual({ rolbypassrls: false, rolsuper: false });
    const donos = await linhas<{ relname: string }>(
      `select c.relname from pg_class c join pg_roles r on r.oid = c.relowner
       where r.rolname in ('mec_app', 'mec_publico')`,
    );
    expect(donos).toEqual([]);
  });

  it("toda função SECURITY DEFINER fixa o search_path", async () => {
    const soltas = await linhas<{ funcao: string }>(
      `select n.nspname || '.' || p.proname as funcao from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname in ('public', 'app')
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(soltas).toEqual([]);
  });

  it("o papel público só executa as duas funções da pesquisa", async () => {
    const tabelas = await linhas<{ tabela: string }>(
      `select table_name as tabela from information_schema.role_table_grants
       where grantee = 'mec_publico'`,
    );
    expect(tabelas).toEqual([]);
    const funcoes = await linhas<{ nome: string }>(
      `select p.proname as nome from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'app') and has_function_privilege('mec_publico', p.oid, 'execute')
         and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       order by 1`,
    );
    expect(funcoes.map((f) => f.nome)).toEqual(["pesquisa_publica", "responder_pesquisa"]);
  });

  it("trilha de auditoria: a aplicação insere e lê, mas não altera nem apaga", async () => {
    const [p] = await linhas<{ upd: boolean; del: boolean; ins: boolean }>(
      `select has_table_privilege('mec_app', 'auditoria', 'update') as upd,
              has_table_privilege('mec_app', 'auditoria', 'delete') as del,
              has_table_privilege('mec_app', 'auditoria', 'insert') as ins`,
    );
    expect(p).toEqual({ upd: false, del: false, ins: true });
  });
});
