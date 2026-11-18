/**
 * Cor do evento escolhida no cadastro.
 *
 * Ela identifica o evento (seletor, cabeçalho, gráficos) e nunca substitui as
 * cores de status. Para continuar legível, precisa de contraste mínimo de 3:1
 * contra o fundo claro (WCAG 2.1, item 1.4.11, componentes gráficos).
 */
export const COR_PADRAO = "#2f7d5b";
export const CONTRASTE_MINIMO = 3;

const HEX = /^#[0-9a-f]{6}$/;

export function normalizarCor(cor: string): string {
  return cor.trim().toLowerCase();
}

export function corValida(cor: string): boolean {
  return HEX.test(normalizarCor(cor));
}

function luminancia(cor: string): number {
  const c = normalizarCor(cor);
  const canais = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Problema com a cor, ou null se ela serve. */
export function problemaDaCor(cor: string): string | null {
  if (!corValida(cor)) return "Use uma cor no formato #RRGGBB.";
  const r = contraste(cor, "#ffffff");
  if (r < CONTRASTE_MINIMO)
    return `Cor clara demais: contraste de ${r.toFixed(1)}:1 com o fundo branco (mínimo ${CONTRASTE_MINIMO}:1). Escolha um tom mais escuro.`;
  return null;
}

/** Texto legível sobre a cor (preto ou branco, o que contrastar mais). */
export function textoSobre(cor: string): "#ffffff" | "#111111" {
  return contraste(cor, "#ffffff") >= contraste(cor, "#111111") ? "#ffffff" : "#111111";
}
