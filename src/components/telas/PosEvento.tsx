/** Peças comuns às telas do pós-evento. */
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

/** Aviso comum às telas do pós-evento: resultado provisório enquanto o ex-post estiver aberto. */
export function AvisoDoExPost({
  existe,
  fechadoEm,
  eventoId,
}: {
  existe: boolean;
  fechadoEm: string | null;
  eventoId: string;
}) {
  if (fechadoEm) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg bg-info-soft p-3 text-sm text-info-text">
      <Info className="size-4 shrink-0" />
      <span>
        {existe
          ? "Resultado provisório: o inventário ex-post ainda está aberto e os números podem mudar."
          : "O inventário ex-post ainda não foi preenchido."}{" "}
        <Link to="/e/$eventoId/inventario-ex-post" params={{ eventoId }} className="underline">
          Inventário ex-post
        </Link>
      </span>
    </p>
  );
}
