import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useSessao } from "@/lib/sessao";

/** Toda tela dentro de `_app` exige sessão. A permissão de cada dado é do servidor. */
export const Route = createFileRoute("/_app")({
  ssr: false,
  component: Protegido,
});

function Protegido() {
  const { perfil, pronta } = useSessao();
  const navegar = useNavigate();
  useEffect(() => {
    if (pronta && !perfil) void navegar({ to: "/", replace: true });
  }, [pronta, perfil, navegar]);
  if (!pronta || !perfil)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Verificando sua sessão…
      </div>
    );
  return <Outlet />;
}
