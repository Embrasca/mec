/** Aba "3 - EX-POST" da Ferramenta: o inventário oficial, com qualidade do dado e evidência. */
import { createFileRoute } from "@tanstack/react-router";
import { TelaDoInventario } from "@/components/telas/Inventario";

export const Route = createFileRoute("/_app/e/$eventoId/inventario-ex-post")({
  head: () => ({ meta: [{ title: "Inventário ex-post" }] }),
  component: () => <TelaDoInventario etapa="ex_post" />,
});
