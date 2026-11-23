import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { textoSobre } from "@/domain/cor";
import { V3_16, type Nivel } from "@/domain/metodologia/v3_16";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  hint,
  actions,
  className,
  children,
}: {
  title?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("panel p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Painel que começa fechado: o cabeçalho (título, resumo e ações) fica sempre
 * visível; o conteúdo só é montado quando a pessoa abre.
 */
export function PainelExpansivel({
  title,
  resumo,
  actions,
  children,
}: {
  title: string;
  resumo?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center gap-3 p-5">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={id}
          onClick={() => setAberto((a) => !a)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform", aberto && "rotate-90")}
          />
          <span>{title}</span>
        </button>
        {(resumo || actions) && (
          <div className="flex flex-wrap items-center gap-3">
            {resumo}
            {actions}
          </div>
        )}
      </div>
      {aberto && (
        <div id={id} className="px-5 pb-5">
          {children}
        </div>
      )}
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="page-description mt-1 max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const TOM_DO_NIVEL: Record<Nivel, string> = {
  1: "bg-success-soft text-success-text",
  2: "bg-info-soft text-info-text",
  3: "bg-warning-soft text-warning-text",
  4: "bg-danger-soft text-danger-text",
};

/** Selo do nível. Cores fixas por nível, independentes da cor do evento. */
export function NivelBadge({
  nivel,
  longo,
  sobreEscuro,
}: {
  nivel: Nivel | null;
  longo?: boolean;
  /** Na barra escura do topo, o selo vazio usa as cores da barra. */
  sobreEscuro?: boolean;
}) {
  if (nivel === null)
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-dashed px-2.5 py-0.5 text-xs",
          sobreEscuro
            ? "border-[var(--topbar-muted)] text-[var(--topbar-foreground)]"
            : "border-border text-muted-foreground",
        )}
      >
        Nível não definido
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TOM_DO_NIVEL[nivel],
      )}
      title={V3_16.designacoes[nivel - 1]}
    >
      Nível {nivel}
      {longo && <span className="ml-1 font-normal">· {V3_16.designacoes[nivel - 1]}</span>}
    </span>
  );
}

/** Marca do evento com a cor escolhida no cadastro. */
export function EventoMarca({
  cor,
  nome,
  tamanho = 28,
}: {
  cor: string;
  nome: string;
  tamanho?: number;
}) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-lg text-[13px] font-bold"
      style={{ background: cor, color: textoSobre(cor), width: tamanho, height: tamanho }}
    >
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {texto}
    </p>
  );
}

export function Falha({ erro }: { erro: unknown }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger-text"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {erro instanceof Error ? erro.message : "Não foi possível carregar."}
    </p>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function formatarData(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
