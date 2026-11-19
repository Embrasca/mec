/**
 * Gerador mínimo de XLSX (Office Open XML). Só o que o relatório precisa:
 * várias abas, texto e número, primeira linha em negrito e largura de coluna.
 * O arquivo é um ZIP com XML dentro; o ZIP é feito pelo fflate.
 */
import { strToU8, zipSync } from "fflate";

export type Celula = string | number | null | undefined;

export interface Aba {
  nome: string;
  linhas: Celula[][];
  /** Largura das colunas, em caracteres. */
  larguras?: number[];
}

const escapar = (s: string) =>
  s
    // Caracteres de controle não são aceitos em XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function coluna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Nome de aba: até 31 caracteres, sem : \ / ? * [ ], e sem repetir. */
function nomesDasAbas(abas: Aba[]): string[] {
  const usados = new Set<string>();
  return abas.map((a) => {
    const base =
      a.nome
        .replace(/[:\\/?*[\]]/g, " ")
        .trim()
        .slice(0, 31) || "Aba";
    let nome = base;
    for (let n = 2; usados.has(nome.toLowerCase()); n++)
      nome = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    usados.add(nome.toLowerCase());
    return nome;
  });
}

/**
 * Texto que começa com = + - @ vira fórmula quando aberto em algumas
 * ferramentas. Como o conteúdo vem de usuários, ele é gravado sempre como
 * texto (t="inlineStr"), o que já impede a interpretação no Excel.
 */
function celula(ref: string, v: Celula, negrito: boolean): string {
  const s = negrito ? ' s="1"' : "";
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapar(v)}</t></is></c>`;
}

function folha(aba: Aba): string {
  const cols = aba.larguras?.length
    ? `<cols>${aba.larguras
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";
  const linhas = aba.linhas
    .map(
      (l, r) =>
        `<row r="${r + 1}">${l.map((v, c) => celula(`${coluna(c)}${r + 1}`, v, r === 0)).join("")}</row>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${linhas}</sheetData></worksheet>`;
}

export function gerarXlsx(abas: Aba[]): Uint8Array {
  const nomes = nomesDasAbas(abas);
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes
      .map((n, i) => `<sheet name="${escapar(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join(
        "",
      )}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  abas.forEach((a, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(folha(a));
  });
  return zipSync(arquivos);
}
