/**
 * Território (IBGE) e a regra de "local" aprovada para os indicadores ESG
 * (decisão D1): conta como local quem é do mesmo município do evento ou da
 * mesma região metropolitana (ou RIDE). Se o município do evento não fizer
 * parte de nenhuma, vale a região imediata do IBGE.
 *
 * Os dados vêm de `ibge.json`, gerado por `scripts/gerar-territorio.py`.
 */
import dados from "./ibge.json";

export interface Municipio {
  id: number;
  nome: string;
  uf: string;
  regiaoImediata: number;
}

const LISTA: Municipio[] = (dados.municipios as [number, string, string, number][]).map(
  ([id, nome, uf, regiaoImediata]) => ({ id, nome, uf, regiaoImediata }),
);
const POR_ID = new Map(LISTA.map((m) => [m.id, m]));
const IMEDIATAS = dados.regioesImediatas as Record<string, string>;
const REGIOES = dados.regioesMetropolitanas as { id: string; nome: string; municipios: number[] }[];

export const FONTE_TERRITORIO = `${dados.fonte}, dados obtidos em ${dados.obtidoEm}`;

export const municipio = (id: number | null | undefined) =>
  id === null || id === undefined ? undefined : POR_ID.get(id);

export const municipiosDaUf = (uf: string) => LISTA.filter((m) => m.uf === uf);

export const nomeDoMunicipio = (id: number | null | undefined) => {
  const m = municipio(id);
  return m ? `${m.nome}/${m.uf}` : null;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Acha o município pelo nome digitado e pela UF (para eventos antigos). */
export function acharMunicipio(nome: string, uf: string): Municipio | undefined {
  const alvo = semAcento(nome);
  return LISTA.find((m) => m.uf === uf && semAcento(m.nome) === alvo);
}

export interface AreaLocal {
  criterio: "regiao_metropolitana" | "regiao_imediata";
  /** Nome das regiões usadas (RM/RIDE ou a região imediata). */
  regioes: string[];
  municipios: Set<number>;
}

/** Área local de um evento a partir do município onde ele acontece. */
export function areaLocal(municipioDoEvento: number): AreaLocal | null {
  const m = POR_ID.get(municipioDoEvento);
  if (!m) return null;
  const rms = REGIOES.filter((r) => r.municipios.includes(m.id));
  if (rms.length > 0) {
    const ids = new Set<number>([m.id]);
    for (const r of rms) for (const id of r.municipios) ids.add(id);
    return { criterio: "regiao_metropolitana", regioes: rms.map((r) => r.nome), municipios: ids };
  }
  return {
    criterio: "regiao_imediata",
    regioes: [`Região imediata de ${IMEDIATAS[String(m.regiaoImediata)] ?? m.regiaoImediata}`],
    municipios: new Set(
      LISTA.filter((x) => x.regiaoImediata === m.regiaoImediata).map((x) => x.id),
    ),
  };
}

export function descreverArea(a: AreaLocal | null): string {
  if (!a) return "Informe o município do evento no cadastro para definir a área local.";
  return `${a.regioes.join(" e ")} (${a.municipios.size} município${a.municipios.size === 1 ? "" : "s"})`;
}
