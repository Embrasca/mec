/** Aba "2 - EX-ANTE" da Ferramenta: estimativa das emissões antes do evento. */
import { createFileRoute } from "@tanstack/react-router";
import { TelaDoInventario } from "@/components/telas/Inventario";

export const Route = createFileRoute("/_app/e/$eventoId/inventario")({
  head: () => ({ meta: [{ title: "Inventário ex-ante" }] }),
  component: () => <TelaDoInventario etapa="ex_ante" />,
});
