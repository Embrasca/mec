// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

const NEON_AUTH = "@neondatabase/neon-js/auth";
const STUB_ID = "\0embrasca:neon-auth-browser-only";

/**
 * Mantém o pacote `@neondatabase/neon-js/auth` fora do pacote do servidor.
 *
 * O pacote roda `crypto.randomUUID()` no topo do próprio arquivo. Em runtime de
 * Worker — que é o que o editor do Lovable executa — gerar valor aleatório no
 * escopo global é proibido, e o módulo derruba o isolate antes do primeiro
 * pedido ("This page didn't load").
 *
 * Trocar o `import` estático por `import()` dinâmico em `lib/neon-auth-client.ts`
 * não basta: o Rolldown juntou os auxiliares do tslib (`__assign`, `__rest`,
 * `__spreadArray`) no mesmo chunk do Neon Auth, então qualquer biblioteca
 * compilada com tslib — Radix Dialog, react-remove-scroll, aria-hidden —
 * passou a importar aquele chunk estaticamente e o problema voltou por outro
 * caminho.
 *
 * O cliente só é usado no navegador (sempre dentro de efeito ou de handler),
 * então no servidor ele é substituído por um stub que falha alto se alguém
 * tentar usá-lo em SSR. Assim nenhum agrupamento de chunk pode trazê-lo de
 * volta.
 */
function neonAuthBrowserOnly(): Plugin {
  return {
    name: "embrasca:neon-auth-browser-only",
    enforce: "pre",
    resolveId(id, _importer, options) {
      const server = this.environment ? this.environment.name !== "client" : Boolean(options?.ssr);
      return id === NEON_AUTH && server ? STUB_ID : null;
    },
    load(id) {
      if (id !== STUB_ID) return null;
      return [
        "export function createAuthClient() {",
        '  throw new Error("O cliente do Neon Auth existe apenas no navegador: ' +
          'chame loadAuthClient dentro de um efeito ou de um handler.");',
        "}",
      ].join("\n");
    },
  };
}

export default defineConfig({
  // `inlineDynamicImports` é opção do nitro, e chega lá: o
  // @lovable.dev/vite-tanstack-config repassa este objeto inteiro para o plugin
  // (`{ defaultPreset, ...userNitroOpts }`, em dist/index.js). O que ele não faz
  // é declarar a chave: o tipo da opção `nitro` lista só `preset`, `output` e
  // `cloudflare`, e o próprio pacote diz que a superfície é estreita de
  // propósito enquanto o Nitro 3 não sai do beta. Sem esta conversão o
  // `bun run typecheck` quebra, embora a build passe. É ajuste de tipo, não
  // muda o que é construído.
  // Na Vercel, as funções rodam em São Paulo (gru1), ao lado do banco Neon
  // (sa-east-1): cada consulta evita a ida e volta até os Estados Unidos.
  nitro: {
    inlineDynamicImports: true,
    vercel: { functions: { regions: ["gru1"] } },
  } as unknown as { preset?: string },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [neonAuthBrowserOnly()],
    ssr: {
      /**
       * O zod passa pelo Vite em vez de ser deixado para o runtime resolver.
       *
       * Sem isto, o `bun run test` nesta máquina importava `zod@4.6.7` do
       * cache global do Bun, e não o `zod@3.25.76` que está em
       * `node_modules`. No zod 4 a raiz não exporta mais `z`, então
       * `import { z } from "zod"` virava `undefined` e cinco arquivos de teste
       * quebravam na importação, sem chegar a rodar um caso sequer. É o
       * sintoma dos dois arquivos de lock: o `bun.lock` resolve as
       * dependências de um jeito e o `package-lock.json`, que é o que o CI e o
       * Vercel usam, de outro.
       *
       * Com `noExternal` quem resolve é o Vite, a partir da pasta do projeto,
       * e aí vale a versão declarada no `package.json` em qualquer máquina.
       */
      noExternal: ["zod"],
    },
  },
});
