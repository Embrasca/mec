// Único lugar do projeto que carrega o pacote do Neon Auth.
//
// POR QUE ISSO EXISTE
//
// O pacote `@neondatabase/neon-js/auth` executa isto no topo do próprio
// arquivo, fora de qualquer função:
//
//     var CURRENT_TAB_CLIENT_ID = crypto.randomUUID();
//
// Gerar valor aleatório no escopo global é **proibido** em runtime de Worker
// (Cloudflare/workerd), que é o alvo do nitro nesta build e o que o editor do
// Lovable executa. Em ESM, todo `import` estático é avaliado na partida do
// isolate, então bastava **um** arquivo do servidor importar o pacote para a
// aplicação inteira cair antes de atender o primeiro pedido. A tela virava
// "This page didn't load".
//
// COMO ISSO RESOLVE
//
// `import type` some na build: não entra no grafo de módulos do servidor.
// O pacote de verdade só é buscado dentro de `loadAuthClient`, que só é
// chamada de dentro de efeito ou de função assíncrona, ou seja, sempre no
// navegador e sempre dentro de um handler. O servidor nunca avalia o pacote.
//
// REGRA
//
// Nenhum outro arquivo pode escrever
// `import { createAuthClient } from "@neondatabase/neon-js/auth"`.
// Há uma trava em `src/lib/__tests__/no-static-neon-auth-import.test.ts`.
import type { VanillaBetterAuthClient } from "@neondatabase/neon-js/auth";

export type AuthClient = VanillaBetterAuthClient;

const clients = new Map<string, AuthClient>();
let modulePromise: Promise<{ createAuthClient: (url: string) => unknown }> | undefined;

/** Carrega o pacote uma vez só, por mais que várias telas peçam ao mesmo tempo. */
function loadModule() {
  if (!modulePromise) {
    modulePromise = import("@neondatabase/neon-js/auth") as Promise<{
      createAuthClient: (url: string) => unknown;
    }>;
  }
  return modulePromise;
}

/** Cliente do Neon Auth para esta URL, criado sob demanda e reaproveitado. */
export async function loadAuthClient(baseUrl: string): Promise<AuthClient> {
  const cached = clients.get(baseUrl);
  if (cached) return cached;
  const { createAuthClient } = await loadModule();
  // Outra chamada pode ter criado enquanto esta esperava o pacote chegar.
  const raced = clients.get(baseUrl);
  if (raced) return raced;
  const client = createAuthClient(baseUrl) as AuthClient;
  clients.set(baseUrl, client);
  return client;
}
