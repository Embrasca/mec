/** Aba COLETA da Ferramenta: quadros com o que for previsto (para o ex-ante). */
import { createFileRoute } from "@tanstack/react-router";
import { TelaDaColeta } from "@/components/telas/Coleta";

export const Route = createFileRoute("/_app/e/$eventoId/coleta")({
  head: () => ({ meta: [{ title: "Coleta (previsão)" }] }),
  component: () => <TelaDaColeta etapa="ex_ante" />,
});
