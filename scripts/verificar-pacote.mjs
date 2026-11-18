// Falha se código do servidor (SQL, papel do banco, variáveis secretas) aparecer
// no pacote enviado ao navegador. Rode depois de `npm run build`.
// Motivo: um createServerFn escrito de forma que o compilador não reconheça
// faz a função inteira rodar no navegador, levando o código do servidor junto.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const PASTA = path.resolve(".output/public");
const MARCAS = [
  "set local role",
  "app.user_id",
  "evento_membros",
  "requisitos_acompanhamento",
  "DATABASE_URL",
  "Banco não configurado",
];

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith(".js") ? [p] : [];
  });
}

let lista;
try {
  lista = arquivos(PASTA);
} catch {
  console.error(`Pasta ${PASTA} não encontrada. Rode o build antes.`);
  process.exit(1);
}
const achados = lista.flatMap((f) => {
  const texto = readFileSync(f, "utf8");
  return MARCAS.filter((m) => texto.includes(m)).map((m) => `${path.relative(PASTA, f)}: "${m}"`);
});
if (achados.length) {
  console.error("Código do servidor no pacote do navegador:\n" + achados.join("\n"));
  process.exit(1);
}
console.log(`Pacote do navegador limpo (${lista.length} arquivos verificados).`);
