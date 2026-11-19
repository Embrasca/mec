/**
 * Moldura das telas autenticadas: menu lateral, barra do topo com o seletor de
 * evento e a conta. Visual e classes do design system do EMBRASCA.CLIMATE.
 */
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  GitCompare,
  Scale,
  CalendarRange,
  Grid3x3,
  ListChecks,
  ListTodo,
  TrendingDown,
  Calculator,
  ClipboardList,
  Library,
  Truck,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  Gauge,
  History,
  LayoutGrid,
  LogOut,
  Moon,
  Settings2,
  Sun,
  Users,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useSessao } from "@/lib/sessao";
import { useTema } from "@/lib/theme";
import { MARCA, NOME_DA_PLATAFORMA, SUBTITULO } from "@/lib/marca";
import { cn } from "@/lib/utils";
import { eventosListar } from "@/api/api.functions";
import type { EventoResumo } from "@/servidor/servicos/eventos.server";
import { EventoMarca, NivelBadge } from "./kit";

interface ItemDeMenu {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

function ItemDoMenu({ item }: { item: ItemDeMenu }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ativo = item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const Icone = item.icon;
  return (
    <Link
      to={item.to}
      activeProps={{ className: "" }}
      className={cn("nav-link", ativo && "active")}
      aria-current={ativo ? "page" : undefined}
      title={item.label}
    >
      <Icone />
      <span className="nav-label truncate">{item.label}</span>
    </Link>
  );
}

function Secao({ titulo, itens }: { titulo?: string; itens: ItemDeMenu[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="mb-3">
      {titulo && <p className="nav-label eyebrow px-3 pb-1 pt-2">{titulo}</p>}
      {itens.map((i) => (
        <ItemDoMenu key={i.to} item={i} />
      ))}
    </div>
  );
}

/** Seletor de evento no topo: troca de evento mantendo a mesma área. */
function SeletorDeEvento({ atual }: { atual: EventoResumo | undefined }) {
  const [aberto, setAberto] = useState(false);
  const navegar = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const eventos = useQuery({
    queryKey: ["eventos", false],
    queryFn: () => eventosListar({ data: {} }),
    enabled: aberto,
  });
  const area = atual ? (pathname.split(`/e/${atual.id}`)[1] ?? "") : "";

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 text-left"
      >
        {atual ? (
          <>
            <EventoMarca cor={atual.cor} nome={atual.nome} tamanho={36} />
            <span className="min-w-0">
              <span className="topbar-cliente-nome block">{atual.nome}</span>
              <span className="topbar-cliente-linha">
                {atual.cidade}/{atual.uf} · {atual.instituicao}
              </span>
            </span>
          </>
        ) : (
          <span className="topbar-titulo">Selecione um evento</span>
        )}
        <ChevronDown className="size-4 shrink-0 text-[var(--topbar-muted)]" />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} aria-hidden />
          <div
            role="listbox"
            className="absolute left-0 z-50 mt-2 max-h-[60vh] w-80 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-foreground shadow-lg"
          >
            <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Eventos
            </p>
            {eventos.isLoading && (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">Carregando…</p>
            )}
            {eventos.data?.map((e) => (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={e.id === atual?.id}
                onClick={() => {
                  setAberto(false);
                  void navegar({ to: `/e/${e.id}${area}` });
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted",
                  e.id === atual?.id && "bg-muted",
                )}
              >
                <EventoMarca cor={e.cor} nome={e.nome} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{e.nome}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {e.cidade}/{e.uf}
                  </span>
                </span>
                <NivelBadge nivel={e.nivel} />
              </button>
            ))}
            <Link
              to="/eventos"
              onClick={() => setAberto(false)}
              className="mt-1 block border-t border-border px-2.5 pb-1 pt-2 text-[12px] text-muted-foreground underline hover:text-foreground"
            >
              Ver portfólio de eventos
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Conta() {
  const { perfil, sair } = useSessao();
  const navegar = useNavigate();
  const [aberto, setAberto] = useState(false);
  if (!perfil) return null;
  const iniciais = perfil.nome
    .split(/[ .@]/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex items-center gap-2 rounded-lg p-1"
        aria-label="Conta"
      >
        <span className="avatar">{iniciais}</span>
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-1.5 text-foreground shadow-lg">
            <div className="px-2.5 py-2">
              <p className="truncate text-[13.5px] font-semibold">{perfil.nome}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{perfil.email}</p>
              {perfil.adminPlataforma && (
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  Administração da plataforma
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                await sair();
                void navegar({ to: "/" });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg border-t border-border px-2.5 py-2.5 text-left text-[13.5px] hover:bg-muted"
            >
              <LogOut className="size-4 text-muted-foreground" strokeWidth={1.75} /> Sair
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ evento, children }: { evento?: EventoResumo; children: ReactNode }) {
  const { perfil } = useSessao();
  const { tema, trocar } = useTema();
  const [recolhido, setRecolhido] = useState(false);

  const global: ItemDeMenu[] = [
    { to: "/eventos", label: "Portfólio de eventos", icon: LayoutGrid, exact: true },
    { to: "/instrucoes", label: "Instruções", icon: BookOpen, exact: true },
    { to: "/fatores", label: "Base de fatores", icon: Library },
  ];
  const e = evento ? `/e/${evento.id}` : "";
  const gruposDoEvento: { titulo: string; itens: ItemDeMenu[] }[] = evento
    ? [
        {
          titulo: "Evento",
          itens: [{ to: e, label: "Visão geral", icon: Gauge, exact: true }],
        },
        {
          titulo: "Governança",
          itens: [
            { to: `${e}/caracterizacao`, label: "Caracterização e nível", icon: ClipboardCheck },
            { to: `${e}/acompanhamento`, label: "Requisitos do nível", icon: History },
            { to: `${e}/checklist`, label: "Checklist do nível", icon: ListChecks },
          ],
        },
        {
          titulo: "Pré-evento",
          itens: [
            { to: `${e}/fornecedores`, label: "Fornecedores", icon: Truck },
            { to: `${e}/coleta`, label: "Coleta (previsão)", icon: ClipboardList },
            { to: `${e}/inventario`, label: "Inventário ex-ante", icon: Calculator },
            { to: `${e}/reducao`, label: "Plano de redução", icon: TrendingDown },
          ],
        },
        {
          titulo: "Execução",
          itens: [
            { to: `${e}/ocorrencias`, label: "Ocorrências", icon: AlertTriangle },
            { to: `${e}/coleta-ex-post`, label: "Coleta (realizado)", icon: ClipboardList },
            { to: `${e}/inventario-ex-post`, label: "Inventário ex-post", icon: Calculator },
          ],
        },
        {
          titulo: "Pós-evento",
          itens: [
            { to: `${e}/resultados`, label: "Resultados", icon: BarChart3 },
            { to: `${e}/comparacao`, label: "Comparação", icon: GitCompare },
            { to: `${e}/compensacao`, label: "Compensação", icon: Scale },
          ],
        },
        {
          titulo: "Gestão",
          itens: [
            { to: `${e}/matriz`, label: "Matriz impacto × relevância", icon: Grid3x3 },
            { to: `${e}/plano-de-acao`, label: "Plano de ação", icon: ListTodo },
            { to: `${e}/linha-do-tempo`, label: "Linha do tempo", icon: CalendarRange },
          ],
        },
        {
          titulo: "Configuração",
          itens: [
            { to: `${e}/equipe`, label: "Equipe", icon: Users },
            { to: `${e}/cadastro`, label: "Cadastro do evento", icon: Settings2 },
          ],
        },
      ]
    : [];
  const administracao: ItemDeMenu[] = perfil?.adminPlataforma
    ? [
        { to: "/admin/usuarios", label: "Usuários", icon: UserCog },
        { to: "/admin/auditoria", label: "Auditoria", icon: History },
      ]
    : [];

  return (
    <div className={cn(recolhido && "sidebar-collapsed")}>
      <aside className="app-sidebar" aria-label="Menu principal">
        <div className="sidebar-brand">
          <Link to="/eventos" className="brand-logo">
            <img src="/embrasca-logo.svg" alt="" />
            <span className="brand-wordmark">
              {MARCA.prefixo}
              <span>{MARCA.sufixo}</span>
            </span>
          </Link>
        </div>
        <nav className="sidebar-nav">
          <Secao itens={global} />
          {evento && (
            <div
              className="nav-compacta mb-3 rounded-xl border-l-4 pl-1"
              style={{ borderColor: evento.cor }}
              aria-label={`Evento ${evento.nome}`}
            >
              {gruposDoEvento.map((g) => (
                <Secao key={g.titulo} titulo={g.titulo} itens={g.itens} />
              ))}
            </div>
          )}
          <Secao titulo="Administração" itens={administracao} />
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-ferramentas">
            <div className="sidebar-ferramentas-grupo">
              <button
                type="button"
                onClick={trocar}
                className="sidebar-tool"
                aria-label={tema === "escuro" ? "Usar modo claro" : "Usar modo escuro"}
                title={tema === "escuro" ? "Usar modo claro" : "Usar modo escuro"}
              >
                {tema === "escuro" ? <Sun /> : <Moon />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setRecolhido((v) => !v)}
              className="sidebar-tool"
              aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
              title={recolhido ? "Expandir menu" : "Recolher menu"}
            >
              {recolhido ? <ChevronsRight /> : <ChevronsLeft />}
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <div className="app-surface">
          <header className="app-topbar">
            <div className="topbar-esquerda">
              <SeletorDeEvento atual={evento} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {evento && <NivelBadge nivel={evento.nivel} sobreEscuro />}
              <Conta />
            </div>
          </header>
          <div className="page-content space-y-6">{children}</div>
          <footer className="app-bottom">
            <span>{NOME_DA_PLATAFORMA}</span>
            <span>{SUBTITULO}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
