import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { Carregando, Falha } from "@/components/kit";
import { EventoAtual } from "@/lib/evento-atual";
import { eventoObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId")({
  component: AreaDoEvento,
});

function AreaDoEvento() {
  const { eventoId } = Route.useParams();
  const evento = useQuery({
    queryKey: ["evento", eventoId],
    queryFn: () => eventoObter({ data: { id: eventoId } }),
  });
  if (evento.isLoading)
    return (
      <Shell>
        <Carregando texto="Abrindo o evento…" />
      </Shell>
    );
  if (!evento.data)
    return (
      <Shell>
        <Falha erro={evento.error} />
        <Link to="/eventos" className="text-sm text-brand underline">
          Voltar ao portfólio
        </Link>
      </Shell>
    );
  return (
    <EventoAtual.Provider value={evento.data}>
      <Shell evento={evento.data}>
        <Outlet />
      </Shell>
    </EventoAtual.Provider>
  );
}
