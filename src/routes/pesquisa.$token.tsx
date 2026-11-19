/** Formulário público e anônimo da pesquisa de satisfação (sem login). */
import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import {
  ASPECTOS,
  MEIOS_DE_TRANSPORTE,
  respostaSchema,
  type Resposta,
} from "@/domain/esg/esquemas";
import { UFS } from "@/domain/evento";
import { municipiosDaUf } from "@/domain/territorio";
import { MARCA } from "@/lib/marca";
import { cn } from "@/lib/utils";
import { pesquisaPublicaObter, pesquisaPublicaResponder } from "@/api/api.functions";

export const Route = createFileRoute("/pesquisa/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Pesquisa de satisfação" }, { name: "robots", content: "noindex" }],
  }),
  component: PesquisaPublica,
});

const vazia = (): Resposta => ({
  satisfacao: 0,
  nps: null,
  organizacao: null,
  conteudo: null,
  alimentacao: null,
  acessibilidade: null,
  sustentabilidade: null,
  notouSustentabilidade: null,
  meioTransporte: null,
  municipioOrigem: null,
  comentario: null,
});

const chaveLocal = (token: string) => `pesquisa-respondida:${token.slice(0, 12)}`;
const jaRespondeu = (token: string) => {
  try {
    return localStorage.getItem(chaveLocal(token)) === "1";
  } catch {
    return false;
  }
};

function PesquisaPublica() {
  const { token } = Route.useParams();
  const info = useQuery({
    queryKey: ["pesquisa-publica", token],
    queryFn: () => pesquisaPublicaObter({ data: { token } }),
    retry: false,
  });
  const [r, setR] = useState<Resposta>(vazia);
  const [uf, setUf] = useState<string>("");
  const [site, setSite] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(() => jaRespondeu(token));
  const mudar = (v: Partial<Resposta>) => setR((x) => ({ ...x, ...v }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    const v = respostaSchema.safeParse({ ...r, comentario: r.comentario?.trim() || null });
    if (!v.success) {
      setErro(v.error.issues[0]?.message ?? "Revise as respostas.");
      return;
    }
    setEnviando(true);
    try {
      await pesquisaPublicaResponder({ data: { token, resposta: v.data, site } });
      try {
        localStorage.setItem(chaveLocal(token), "1");
      } catch {
        // sem armazenamento local: tudo bem
      }
      setEnviada(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  const casca = (filho: ReactNode) => (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <p className="text-sm font-semibold tracking-wide text-muted-foreground">
          {MARCA.prefixo}
          <span>{MARCA.sufixo}</span>
        </p>
        {filho}
      </div>
    </div>
  );

  if (info.isLoading) return casca(<p className="text-sm text-muted-foreground">Carregando…</p>);
  if (!info.data)
    return casca(
      <p className="rounded-lg bg-muted p-4 text-sm">
        Este link de pesquisa não é válido. Confira o endereço com a organização do evento.
      </p>,
    );
  const p = info.data;
  if (!p.aberta)
    return casca(
      <p className="rounded-lg bg-muted p-4 text-sm">
        A pesquisa de {p.nome} está encerrada. Obrigado!
      </p>,
    );
  if (enviada)
    return casca(
      <div className="panel flex items-start gap-3 p-5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-text" />
        <div>
          <h1 className="text-lg font-semibold">Resposta enviada. Obrigado!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua opinião ajuda a melhorar as próximas edições de {p.nome}.
          </p>
        </div>
      </div>,
    );

  return casca(
    <form onSubmit={enviar} className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{p.nome}</h1>
        <p className="text-sm text-muted-foreground">
          Pesquisa de satisfação · {p.cidade}/{p.uf}. Anônima: não pedimos nome, e-mail nem
          documento. Leva cerca de 2 minutos.
        </p>
      </header>

      <Pergunta titulo="De modo geral, qual a sua satisfação com o evento?" obrigatoria>
        <Escala
          de={1}
          ate={5}
          valor={r.satisfacao || null}
          nome="satisfacao"
          aoMudar={(v) => mudar({ satisfacao: v ?? 0 })}
          rotulos={["Muito insatisfeito", "Muito satisfeito"]}
        />
      </Pergunta>

      {p.nps && (
        <Pergunta titulo="De 0 a 10, quanto você recomendaria este evento a alguém?">
          <Escala
            de={0}
            ate={10}
            valor={r.nps}
            nome="nps"
            aoMudar={(v) => mudar({ nps: v })}
            rotulos={["Nada provável", "Muito provável"]}
          />
        </Pergunta>
      )}

      <Pergunta titulo="Avalie cada aspecto (1 = muito ruim, 5 = muito bom)">
        <div className="space-y-3">
          {ASPECTOS.map(([k, nome]) => (
            <div key={k} className="space-y-1">
              <p className="text-sm">{nome}</p>
              <Escala
                de={1}
                ate={5}
                valor={r[k]}
                nome={k}
                aoMudar={(v) => mudar({ [k]: v } as Partial<Resposta>)}
              />
            </div>
          ))}
        </div>
      </Pergunta>

      <Pergunta titulo="Você notou alguma ação de sustentabilidade no evento?">
        <div className="flex gap-2">
          {[
            [true, "Sim"],
            [false, "Não"],
          ].map(([v, t]) => (
            <Opcao
              key={String(v)}
              ativo={r.notouSustentabilidade === v}
              onClick={() =>
                mudar({
                  notouSustentabilidade: r.notouSustentabilidade === v ? null : (v as boolean),
                })
              }
            >
              {t as string}
            </Opcao>
          ))}
        </div>
      </Pergunta>

      <Pergunta titulo="Como você chegou ao evento?">
        <div className="flex flex-wrap gap-2">
          {MEIOS_DE_TRANSPORTE.map((m) => (
            <Opcao
              key={m}
              ativo={r.meioTransporte === m}
              onClick={() => mudar({ meioTransporte: r.meioTransporte === m ? null : m })}
            >
              {m}
            </Opcao>
          ))}
        </div>
      </Pergunta>

      <Pergunta titulo="De que cidade você veio?">
        <div className="flex gap-2">
          <select
            aria-label="UF de origem"
            className="h-11 w-24 rounded-md border border-input bg-transparent px-2 text-base"
            value={uf}
            onChange={(e) => {
              setUf(e.target.value);
              mudar({ municipioOrigem: null });
            }}
          >
            <option value="">UF</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select
            aria-label="Cidade de origem"
            className="h-11 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-base"
            disabled={!uf}
            value={r.municipioOrigem ?? ""}
            onChange={(e) => mudar({ municipioOrigem: Number(e.target.value) || null })}
          >
            <option value="">{uf ? "Escolha a cidade" : "Escolha a UF primeiro"}</option>
            {uf &&
              municipiosDaUf(uf).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
          </select>
        </div>
      </Pergunta>

      <Pergunta titulo="Quer deixar um comentário ou sugestão?">
        <textarea
          aria-label="Comentário"
          maxLength={1000}
          rows={4}
          className="w-full rounded-md border border-input bg-transparent p-3 text-base"
          value={r.comentario ?? ""}
          onChange={(e) => mudar({ comentario: e.target.value || null })}
        />
        <p className="text-xs text-muted-foreground">Não escreva dados pessoais.</p>
      </Pergunta>

      {/* Campo invisível contra robôs: pessoas não o veem nem preenchem. */}
      <input
        type="text"
        name="site"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={site}
        onChange={(e) => setSite(e.target.value)}
      />

      {erro && <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger-text">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="h-12 w-full rounded-md bg-brand text-base font-semibold text-brand-foreground disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Enviar resposta"}
      </button>
    </form>,
  );
}

function Pergunta({
  titulo,
  obrigatoria,
  children,
}: {
  titulo: string;
  obrigatoria?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="panel min-w-0 space-y-3 p-4">
      <legend className="sr-only">{titulo}</legend>
      <p className="font-medium">
        {titulo}
        {obrigatoria && <span className="text-danger-text"> *</span>}
      </p>
      {children}
    </fieldset>
  );
}

function Opcao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md border px-3 text-sm",
        ativo ? "border-transparent bg-brand text-brand-foreground" : "border-input hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Escala({
  de,
  ate,
  valor,
  nome,
  aoMudar,
  rotulos,
}: {
  de: number;
  ate: number;
  valor: number | null;
  nome: string;
  aoMudar: (v: number | null) => void;
  rotulos?: [string, string];
}) {
  const notas = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  return (
    <div className="space-y-1">
      <div role="radiogroup" aria-label={nome} className="flex flex-wrap gap-1.5">
        {notas.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            onClick={() => aoMudar(valor === n ? null : n)}
            className={cn(
              "size-11 rounded-md border text-base tabular-nums",
              valor === n
                ? "border-transparent bg-brand font-semibold text-brand-foreground"
                : "border-input hover:bg-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {rotulos && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{rotulos[0]}</span>
          <span>{rotulos[1]}</span>
        </div>
      )}
    </div>
  );
}
