/**
 * Importação de respostas da pesquisa de satisfação a partir de uma planilha
 * CSV (Google Forms, Microsoft Forms ou o modelo do sistema). As colunas são
 * reconhecidas pelo nome; o modelo usa exatamente os nomes de COLUNAS.
 */
import { acharMunicipio, municipio } from "../territorio";
import { ASPECTOS, MEIOS_DE_TRANSPORTE, respostaSchema, type Resposta } from "./esquemas";

export const COLUNAS = [
  "satisfacao",
  "nps",
  "organizacao",
  "conteudo",
  "alimentacao",
  "acessibilidade",
  "sustentabilidade",
  "notou_sustentabilidade",
  "meio_transporte",
  "municipio_origem",
  "uf_origem",
  "comentario",
] as const;
type Coluna = (typeof COLUNAS)[number];

export const MODELO_CSV =
  COLUNAS.join(";") + "\n5;9;5;4;4;5;5;sim;Ônibus ou metrô;Goiânia;GO;Muito bem organizado\n";

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Palavras que identificam cada coluna num cabeçalho escrito por extenso. */
const PISTAS: [Coluna, RegExp][] = [
  ["notou_sustentabilidade", /^notou|percebeu|notou sustentabilidade/],
  ["nps", /^nps$|recomend/],
  ["satisfacao", /^satisfacao$|satisfacao geral|satisfeito/],
  ["organizacao", /organizacao/],
  ["conteudo", /conteudo|programacao/],
  ["alimentacao", /alimentacao|comida|refeic/],
  ["acessibilidade", /acessibilidade/],
  ["sustentabilidade", /^sustentabilidade$|acoes de sustentabilidade/],
  ["meio_transporte", /meio de transporte|meio transporte|como chegou|transporte/],
  ["uf_origem", /^uf|estado de origem|uf origem/],
  ["municipio_origem", /municipio|cidade/],
  ["comentario", /comentario|sugest|observac/],
];

export function identificarColuna(cabecalho: string): Coluna | null {
  const n = normal(cabecalho);
  const exato = COLUNAS.find((c) => normal(c) === n);
  if (exato) return exato;
  return PISTAS.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** CSV com vírgula ou ponto e vírgula, aspas e quebras de linha dentro de aspas. */
export function lerCsv(texto: string): string[][] {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const primeira = t.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((c) => c.trim()));
}

const inteiro = (v: string | undefined) => {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d+)/);
  return m ? Number(m[1]) : NaN;
};
const simNao = (v: string | undefined) => {
  const n = normal(v ?? "");
  if (!n) return null;
  if (["sim", "s", "yes", "1", "true"].includes(n)) return true;
  if (["nao", "n", "no", "0", "false"].includes(n)) return false;
  return undefined;
};

export interface ResultadoDaImportacao {
  respostas: Resposta[];
  erros: { linha: number; mensagem: string }[];
  colunasReconhecidas: Coluna[];
  colunasIgnoradas: string[];
}

export function importarRespostas(texto: string, ufPadrao: string | null): ResultadoDaImportacao {
  const [cab, ...linhas] = lerCsv(texto);
  if (!cab)
    return {
      respostas: [],
      erros: [{ linha: 1, mensagem: "Arquivo vazio." }],
      colunasReconhecidas: [],
      colunasIgnoradas: [],
    };
  const mapa = cab.map(identificarColuna);
  const reconhecidas = [...new Set(mapa.filter((c): c is Coluna => c !== null))];
  const ignoradas = cab.filter((_, i) => mapa[i] === null);
  if (!reconhecidas.includes("satisfacao"))
    return {
      respostas: [],
      erros: [{ linha: 1, mensagem: "Não achei a coluna de satisfação geral (nota de 1 a 5)." }],
      colunasReconhecidas: reconhecidas,
      colunasIgnoradas: ignoradas,
    };
  const respostas: Resposta[] = [];
  const erros: ResultadoDaImportacao["erros"] = [];
  linhas.forEach((l, k) => {
    const v = (c: Coluna) => {
      const i = mapa.indexOf(c);
      return i < 0 ? undefined : l[i];
    };
    const meio = (v("meio_transporte") ?? "").trim();
    const meioOk = MEIOS_DE_TRANSPORTE.find((m) => normal(m) === normal(meio));
    const muni = (v("municipio_origem") ?? "").trim();
    const uf = (v("uf_origem") ?? "").trim().toUpperCase() || ufPadrao || "";
    const codigo = /^\d{7}$/.test(muni) ? Number(muni) : null;
    const m = codigo
      ? municipio(codigo)
      : muni
        ? acharMunicipio(
            muni.replace(/\/[A-Za-z]{2}$/, ""),
            muni.match(/\/([A-Za-z]{2})$/)?.[1]?.toUpperCase() ?? uf,
          )
        : undefined;
    const notou = simNao(v("notou_sustentabilidade"));
    const bruto = {
      satisfacao: inteiro(v("satisfacao")),
      nps: inteiro(v("nps")),
      ...Object.fromEntries(ASPECTOS.map(([a]) => [a, inteiro(v(a))])),
      notouSustentabilidade: notou === undefined ? null : notou,
      meioTransporte: meioOk ?? (meio ? "Outro" : null),
      municipioOrigem: m?.id ?? null,
      comentario: (v("comentario") ?? "").trim().slice(0, 1000) || null,
    };
    const r = respostaSchema.safeParse(bruto);
    if (r.success) respostas.push(r.data);
    else erros.push({ linha: k + 2, mensagem: r.error.issues[0]?.message ?? "Linha inválida." });
  });
  return { respostas, erros, colunasReconhecidas: reconhecidas, colunasIgnoradas: ignoradas };
}
