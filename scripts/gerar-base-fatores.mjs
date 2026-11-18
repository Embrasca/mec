// Gera a migração que carrega a base de fatores da Ferramenta v3.16, a partir de
// src/domain/metodologia/v3_16/inventario.json (extraído da planilha).
// Uso: node scripts/gerar-base-fatores.mjs > migrations/0003_base_ghg_2026_0_1.sql
import { readFileSync } from "node:fs";

const { baseDeFatores: b } = JSON.parse(
  readFileSync(new URL("../src/domain/metodologia/v3_16/inventario.json", import.meta.url), "utf8"),
);
const q = (v) =>
  v === null || v === undefined
    ? "null"
    : typeof v === "number"
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;
const id = "00000000-0000-4000-8000-000000202601";

const linhas = [
  `-- Base de fatores da Ferramenta MEC/GIZ v3.16 (${b.nome}).`,
  "-- Gerado por scripts/gerar-base-fatores.mjs. Não edite à mão.",
  "",
  `insert into bases_fatores (id, nome, gwp_ch4, gwp_n2o, referencia_gwp, observacao) values (${q(id)}, ${q(b.nome)}, ${b.gwpCh4}, ${b.gwpN2o}, ${q(b.referenciaGwp)}, ${q("Ferramenta de Cálculo do Programa Brasileiro GHG Protocol, versão 2026.0.1, como adotada na Ferramenta MEC/GIZ v3.16.")});`,
  "",
  "insert into fatores (base_id, item, codigo, categoria, unidade, escopo, fe_co2, fe_ch4, fe_n2o, fe_biogenico, regra, multiplicador, fonte, situacao) values",
  b.itens
    .map(
      (i) =>
        `  (${q(id)}, ${q(i.item)}, ${q(i.codigo)}, ${q(i.categoria)}, ${q(i.unidade)}, ${i.escopo}, ${q(i.feCo2)}, ${i.feCh4}, ${i.feN2o}, ${i.feBiogenico}, ${q(i.regra.tipo)}, ${q(i.regra.tipo === "sin" ? i.regra.multiplicador : null)}, ${q(i.fonte)}, ${q(i.situacao)})`,
    )
    .join(",\n") + ";",
  "",
  "insert into fatores_sin (base_id, ano, valor) values",
  b.sin.map((s) => `  (${q(id)}, ${s.ano}, ${s.valor})`).join(",\n") + ";",
  "",
  `update bases_fatores set situacao = 'publicada' where id = ${q(id)};`,
  "",
];
process.stdout.write(linhas.join("\n"));
