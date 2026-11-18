// Decide se a tela de erro pode mostrar a causa real.
//
// A regra principal e o endereco, nao a variavel de ambiente: VERCEL_ENV so
// existe dentro do Vercel, e depender dela significaria confiar que ela chega
// ao servidor em execucao. O endereco o proprio pedido carrega, no servidor e
// no navegador, entao a decisao fica igual nos dois lados.

// O dominio proprio tem de estar aqui. Sem ele, quem entra pelo endereco
// oficial recebe o bloco "Detalhes tecnicos" na tela de erro, porque a segunda
// trava (VERCEL_ENV) so existe no servidor e esta decisao tambem corre no
// navegador.
/** Enderecos oficiais da plataforma. Sao os aliases de producao do Vercel. */
const PRODUCTION_HOSTS = new Set([
  "climate.embrasca.com.br",
  "embrasca-climate.vercel.app",
  "embrasca-climate-embrasca.vercel.app",
  "embrasca-climate-git-main-embrasca.vercel.app",
]);

export function isProductionHost(hostname: string | undefined): boolean {
  if (!hostname) return false;
  return PRODUCTION_HOSTS.has(hostname.toLowerCase().replace(/:\d+$/, ""));
}

/**
 * Mostra a causa em todo lugar que nao seja o site oficial: Lovable, maquina
 * local e pre-visualizacoes do Vercel. HIDE_ERROR_DETAILS=1 esconde em
 * qualquer ambiente, e VERCEL_ENV continua valendo como segunda trava.
 */
export function revealsErrorDetail(hostname: string | undefined): boolean {
  if (isProductionHost(hostname)) return false;
  if (typeof process !== "undefined") {
    if (process.env?.["HIDE_ERROR_DETAILS"] === "1") return false;
    if (process.env?.["VERCEL_ENV"] === "production") return false;
  }
  return true;
}
