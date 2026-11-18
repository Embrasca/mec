/** Sessão real do Neon Auth. Não há perfil de demonstração. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadAuthClient } from "./neon-auth-client";
import { neonAuthUrl } from "./auth-config";
import { esquecerToken } from "./token";
import { minhaSessao } from "@/api/api.functions";

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  adminPlataforma: boolean;
}

interface Sessao {
  perfil: Perfil | null;
  pronta: boolean;
  entrar: (email: string, senha: string) => Promise<Perfil>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pronta, setPronta] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let ativo = true;
    void loadAuthClient(neonAuthUrl())
      .then((auth) => auth.getSession())
      .then(async (r) => {
        if (!r.data?.user) return;
        const p = await minhaSessao();
        if (ativo) setPerfil(p);
      })
      .catch(() => undefined)
      .finally(() => ativo && setPronta(true));
    return () => {
      ativo = false;
    };
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const auth = await loadAuthClient(neonAuthUrl());
    const r = await auth.signIn.email({ email: email.trim().toLowerCase(), password: senha });
    if (r.error) throw new Error("E-mail ou senha incorretos.");
    esquecerToken();
    const p = await minhaSessao();
    setPerfil(p);
    setPronta(true);
    return p;
  }, []);

  const sair = useCallback(async () => {
    const auth = await loadAuthClient(neonAuthUrl());
    await auth.signOut().catch(() => undefined);
    esquecerToken();
    queryClient.clear();
    setPerfil(null);
  }, [queryClient]);

  const valor = useMemo(() => ({ perfil, pronta, entrar, sair }), [perfil, pronta, entrar, sair]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSessao precisa estar dentro de <ProvedorDeSessao>.");
  return c;
}
