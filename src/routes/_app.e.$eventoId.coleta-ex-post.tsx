/** Aba COLETA da Ferramenta: quadros com o que aconteceu (para o ex-post). */
import { createFileRoute } from "@tanstack/react-router";
import { TelaDaColeta } from "@/components/telas/Coleta";

export const Route = createFileRoute("/_app/e/$eventoId/coleta-ex-post")({
  head: () => ({ meta: [{ title: "Coleta (realizado)" }] }),
  component: () => <TelaDaColeta etapa="ex_post" />,
});
