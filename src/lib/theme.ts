/**
 * Modo claro e escuro.
 *
 * A preferência fica em `localStorage` e a classe `.dark` entra no <html>, que
 * é onde `styles.css` declara a variante e redefine os tokens de cor.
 *
 * Nada aqui roda no escopo do módulo. Ler `localStorage` ou `matchMedia` no
 * topo do arquivo derruba o pacote do servidor no runtime de Worker, que é o
 * que o editor do Lovable executa. Toda leitura acontece dentro de função.
 */
import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

export const CHAVE_TEMA = "embrasca-tema";

/**
 * Script que roda antes da primeira pintura, no <head>. Sem ele a página
 * aparece clara e pisca para escuro depois que o React monta.
 */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CHAVE_TEMA}");if(t==="escuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}`;

function temaDoAmbiente(): Tema {
  if (typeof window === "undefined") return "claro";
  try {
    const salvo = window.localStorage.getItem(CHAVE_TEMA);
    if (salvo === "claro" || salvo === "escuro") return salvo;
  } catch {
    // Janela privada ou armazenamento bloqueado: segue a preferência do sistema.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function useTema() {
  // O servidor sempre renderiza "claro"; o script do <head> já acertou a classe
  // no cliente, e o efeito abaixo alinha o estado do React depois da montagem.
  const [tema, setTema] = useState<Tema>("claro");

  useEffect(() => {
    setTema(temaDoAmbiente());
  }, []);

  const trocar = useCallback(() => {
    setTema((atual) => {
      const proximo: Tema = atual === "escuro" ? "claro" : "escuro";
      document.documentElement.classList.toggle("dark", proximo === "escuro");
      try {
        window.localStorage.setItem(CHAVE_TEMA, proximo);
      } catch {
        // Sem armazenamento a escolha vale só nesta aba.
      }
      return proximo;
    });
  }, []);

  return { tema, trocar };
}
