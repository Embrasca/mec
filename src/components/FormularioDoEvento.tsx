import { useState, type FormEvent, type ReactNode } from "react";
import { COR_PADRAO, contraste, problemaDaCor, textoSobre } from "@/domain/cor";
import { eventoSchema, UFS, type DadosDoEvento } from "@/domain/evento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const EVENTO_VAZIO: DadosDoEvento = {
  nome: "",
  instituicao: "",
  cidade: "",
  uf: "GO",
  dataInicio: "",
  dataFim: "",
  cor: COR_PADRAO,
  descricao: null,
};

export function FormularioDoEvento({
  inicial,
  somenteLeitura,
  extra,
  rotuloEnviar,
  enviar,
}: {
  inicial: DadosDoEvento;
  somenteLeitura?: boolean;
  /** Campos a mais no fim do formulário (ex.: gestor na criação). */
  extra?: ReactNode;
  rotuloEnviar: string;
  enviar: (dados: DadosDoEvento) => Promise<unknown>;
}) {
  const [d, setD] = useState<DadosDoEvento>(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const mudar = <K extends keyof DadosDoEvento>(k: K, v: DadosDoEvento[K]) =>
    setD((x) => ({ ...x, [k]: v }));

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    const r = eventoSchema.safeParse(d);
    if (!r.success) {
      setErros(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErros({});
    setEnviando(true);
    try {
      await enviar(r.data);
    } finally {
      setEnviando(false);
    }
  }

  const problemaCor = problemaDaCor(d.cor);
  const campo = (id: keyof DadosDoEvento, rotulo: string, filho: ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ev-${id}`}>{rotulo}</Label>
      {filho}
      {erros[id] && (
        <p role="alert" className="text-xs text-danger">
          {erros[id]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <fieldset disabled={somenteLeitura || enviando} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {campo(
            "nome",
            "Nome do evento",
            <Input
              id="ev-nome"
              value={d.nome}
              maxLength={200}
              onChange={(e) => mudar("nome", e.target.value)}
            />,
          )}
        </div>
        <div className="sm:col-span-2">
          {campo(
            "instituicao",
            "Instituição responsável",
            <Input
              id="ev-instituicao"
              value={d.instituicao}
              maxLength={200}
              onChange={(e) => mudar("instituicao", e.target.value)}
            />,
          )}
        </div>
        {campo(
          "cidade",
          "Cidade",
          <Input
            id="ev-cidade"
            value={d.cidade}
            maxLength={120}
            onChange={(e) => mudar("cidade", e.target.value)}
          />,
        )}
        {campo(
          "uf",
          "UF",
          <select
            id="ev-uf"
            value={d.uf}
            onChange={(e) => mudar("uf", e.target.value as DadosDoEvento["uf"])}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>,
        )}
        {campo(
          "dataInicio",
          "Data de início",
          <Input
            id="ev-dataInicio"
            type="date"
            value={d.dataInicio}
            onChange={(e) => mudar("dataInicio", e.target.value)}
          />,
        )}
        {campo(
          "dataFim",
          "Data de término",
          <Input
            id="ev-dataFim"
            type="date"
            value={d.dataFim}
            onChange={(e) => mudar("dataFim", e.target.value)}
          />,
        )}
        <div className="sm:col-span-2">
          {campo(
            "cor",
            "Cor do evento",
            <div className="flex flex-wrap items-center gap-3">
              <input
                id="ev-cor"
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(d.cor) ? d.cor : COR_PADRAO}
                onChange={(e) => mudar("cor", e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-border bg-transparent"
                aria-describedby="ev-cor-ajuda"
              />
              <Input
                aria-label="Cor em hexadecimal"
                value={d.cor}
                maxLength={7}
                onChange={(e) => mudar("cor", e.target.value)}
                className="w-28 font-mono"
              />
              {!problemaCor && (
                <span
                  className="rounded-md px-3 py-1.5 text-sm font-medium"
                  style={{ background: d.cor, color: textoSobre(d.cor) }}
                >
                  {d.nome || "Prévia"}
                </span>
              )}
              <p id="ev-cor-ajuda" className="w-full text-xs text-muted-foreground">
                Identifica o evento no menu, no seletor e nos gráficos. Precisa de contraste de 3:1
                com o fundo branco
                {!problemaCor && ` (atual: ${contraste(d.cor, "#ffffff").toFixed(1)}:1)`}.
              </p>
              {problemaCor && !erros["cor"] && (
                <p className="w-full text-xs text-danger">{problemaCor}</p>
              )}
            </div>,
          )}
        </div>
        <div className="sm:col-span-2">
          {campo(
            "descricao",
            "Descrição (opcional)",
            <Textarea
              id="ev-descricao"
              value={d.descricao ?? ""}
              maxLength={2000}
              onChange={(e) => mudar("descricao", e.target.value || null)}
            />,
          )}
        </div>
        {extra && <div className="sm:col-span-2">{extra}</div>}
      </fieldset>
      {!somenteLeitura && (
        <div className="flex justify-end">
          <Button type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : rotuloEnviar}
          </Button>
        </div>
      )}
    </form>
  );
}
