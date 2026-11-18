const cache = new Map<number, Intl.NumberFormat>();

/** Número em pt-BR com até `casas` decimais. */
export function numero(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  let f = cache.get(casas);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas });
    cache.set(casas, f);
  }
  return f.format(v);
}

export function porcentagem(v: number | null | undefined, casas = 1): string {
  return v === null || v === undefined ? "—" : `${numero(v * 100, casas)}%`;
}

/** Data de hoje no fuso do navegador, AAAA-MM-DD. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
