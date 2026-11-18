import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ProvedorDeSessao } from "@/lib/sessao";
import { NOME_DA_PLATAFORMA, SUBTITULO } from "@/lib/marca";
import { SCRIPT_TEMA } from "@/lib/theme";
import appCss from "../styles.css?url";

function NaoEncontrada() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">Esta página não existe ou foi movida.</p>
        <Link
          to="/eventos"
          className="mt-6 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
        >
          Ir para o portfólio
        </Link>
      </div>
    </div>
  );
}

function ErroGeral({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">A página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Algo deu errado."}
        </p>
        <button
          type="button"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${NOME_DA_PLATAFORMA} — ${SUBTITULO}` },
      {
        name: "description",
        content:
          "Gestão climática de eventos: caracterização, nível de exigência, inventário de emissões e relatórios.",
      },
      { name: "robots", content: "noindex" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/embrasca-logo.svg" },
    ],
  }),
  shellComponent: Documento,
  component: Raiz,
  notFoundComponent: NaoEncontrada,
  errorComponent: ErroGeral,
});

function Documento({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Raiz() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ProvedorDeSessao>
        <Outlet />
        <Toaster position="top-right" richColors />
      </ProvedorDeSessao>
    </QueryClientProvider>
  );
}
