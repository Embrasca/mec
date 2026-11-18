import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import {
  Carregando,
  EventoMarca,
  Falha,
  formatarData,
  NivelBadge,
  PageHeader,
  Panel,
  Vazio,
} from "@/components/kit";
import { EVENTO_VAZIO, FormularioDoEvento } from "@/components/FormularioDoEvento";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { faseDoEvento, NOME_DO_PAPEL } from "@/domain/evento";
import { NIVEIS } from "@/domain/metodologia/v3_16";
import { useSessao } from "@/lib/sessao";
import { eventoCriar, eventosListar, usuariosListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/eventos")({
  head: () => ({ meta: [{ title: "Portfólio de eventos" }] }),
  component: Portfolio,
});

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Portfolio() {
  const { perfil } = useSessao();
  const [arquivados, setArquivados] = useState(false);
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState<string>("todos");
  const [criando, setCriando] = useState(false);
  const eventos = useQuery({
    queryKey: ["eventos", arquivados],
    queryFn: () => eventosListar({ data: { incluirArquivados: arquivados } }),
  });
  const hoje = hojeISO();

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (eventos.data ?? []).filter(
      (e) =>
        (!termo || `${e.nome} ${e.instituicao} ${e.cidade}`.toLowerCase().includes(termo)) &&
        (nivel === "todos" || (nivel === "sem" ? e.nivel === null : String(e.nivel) === nivel)),
    );
  }, [eventos.data, busca, nivel]);

  const porNivel = useMemo(() => {
    const c = { sem: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<string, number>;
    for (const e of eventos.data ?? []) c[e.nivel === null ? "sem" : String(e.nivel)]! += 1;
    return c;
  }, [eventos.data]);

  return (
    <Shell>
      <PageHeader
        eyebrow="Portfólio"
        title="Eventos"
        description="Todos os eventos a que você tem acesso, com o nível de exigência confirmado de cada um."
        actions={
          perfil?.adminPlataforma && (
            <Button onClick={() => setCriando(true)}>
              <Plus className="size-4" /> Novo evento
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-5">
        {(["sem", "1", "2", "3", "4"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setNivel(nivel === k ? "todos" : k)}
            aria-pressed={nivel === k}
            className={`panel p-4 text-left transition-colors ${nivel === k ? "ring-2 ring-brand" : ""}`}
          >
            <p className="eyebrow">{k === "sem" ? "Sem nível" : `Nível ${k}`}</p>
            <p className="mt-1 text-2xl font-semibold">{porNivel[k] ?? 0}</p>
          </button>
        ))}
      </div>

      <Panel
        title="Lista de eventos"
        actions={
          <>
            <input
              type="search"
              placeholder="Buscar por nome, instituição ou cidade"
              aria-label="Buscar eventos"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-9 w-72 max-w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <select
              aria-label="Filtrar por nível"
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="todos">Todos os níveis</option>
              <option value="sem">Sem nível</option>
              {NIVEIS.map((n) => (
                <option key={n} value={String(n)}>
                  Nível {n}
                </option>
              ))}
            </select>
            {perfil?.adminPlataforma && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={arquivados}
                  onChange={(e) => setArquivados(e.target.checked)}
                />
                Arquivados
              </label>
            )}
          </>
        }
      >
        {eventos.isLoading && <Carregando />}
        {eventos.error && <Falha erro={eventos.error} />}
        {eventos.data && filtrados.length === 0 && (
          <Vazio>
            {eventos.data.length === 0
              ? perfil?.adminPlataforma
                ? "Nenhum evento cadastrado. Use “Novo evento”."
                : "Você ainda não faz parte da equipe de nenhum evento."
              : "Nenhum evento com estes filtros."}
          </Vazio>
        )}
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((e) => (
            <li key={e.id}>
              <Link
                to="/e/$eventoId"
                params={{ eventoId: e.id }}
                className="block h-full rounded-xl border border-border border-l-4 bg-card p-4 transition-shadow hover:shadow-md"
                style={{ borderLeftColor: e.cor }}
              >
                <div className="flex items-start gap-3">
                  <EventoMarca cor={e.cor} nome={e.nome} tamanho={36} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-semibold leading-snug">{e.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.instituicao}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> {formatarData(e.dataInicio)} a{" "}
                    {formatarData(e.dataFim)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" /> {e.cidade}/{e.uf}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <NivelBadge nivel={e.nivel} />
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {e.arquivado ? "Arquivado" : faseDoEvento(hoje, e.dataInicio, e.dataFim)}
                  </span>
                  {e.papel && (
                    <span className="text-xs text-muted-foreground">
                      {NOME_DO_PAPEL[e.papel as keyof typeof NOME_DO_PAPEL]}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {perfil?.adminPlataforma && <NovoEvento aberto={criando} fechar={() => setCriando(false)} />}
    </Shell>
  );
}

function NovoEvento({ aberto, fechar }: { aberto: boolean; fechar: () => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [gestorId, setGestorId] = useState("");
  const usuarios = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => usuariosListar(),
    enabled: aberto,
  });
  const criar = useMutation({ mutationFn: eventoCriar });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
        </DialogHeader>
        <FormularioDoEvento
          inicial={EVENTO_VAZIO}
          rotuloEnviar="Criar evento"
          extra={
            <div className="space-y-1.5">
              <Label htmlFor="ev-gestor">Gestor do evento</Label>
              <select
                id="ev-gestor"
                value={gestorId}
                onChange={(e) => setGestorId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Escolha uma conta</option>
                {usuarios.data
                  ?.filter((u) => u.ativo)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.email})
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                O gestor monta a equipe e confirma o enquadramento. A conta precisa existir em
                Usuários.
              </p>
            </div>
          }
          enviar={async (dados) => {
            if (!gestorId) {
              toast.error("Escolha o gestor do evento.");
              return;
            }
            try {
              const { id } = await criar.mutateAsync({ data: { ...dados, gestorId } });
              await qc.invalidateQueries({ queryKey: ["eventos"] });
              toast.success("Evento criado.");
              fechar();
              void navegar({ to: "/e/$eventoId/caracterizacao", params: { eventoId: id } });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Não foi possível criar o evento.");
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
