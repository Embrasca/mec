/**
 * Matriz impacto × relevância (do EventSustain): mapeia os temas do evento e
 * aponta os prioritários. Serve de base para os temas materiais do GRI 3.
 */
import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NOME_DA_PRIORIDADE,
  prioridadeDoTema,
  temaSchema,
  type Prioridade,
  type Tema,
} from "@/domain/gestao";
import { CATEGORIAS } from "@/domain/metodologia/inventario";
import { useEvento } from "@/lib/evento-atual";
import { gestaoRemover, temaSalvar, temasListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/matriz")({
  head: () => ({ meta: [{ title: "Matriz impacto × relevância" }] }),
  component: Matriz,
});

const VAZIO: Tema = {
  tema: "",
  categoria: null,
  descricao: null,
  impacto: 3,
  relevancia: 3,
  stakeholders: null,
  fonte: null,
};
const ESCALA = [1, 2, 3, 4, 5] as const;

/** Um tom só, mais intenso quanto maior a prioridade (sequencial, não status). */
const FUNDO: Record<Prioridade, string> = {
  baixa: "color-mix(in oklab, var(--info) 8%, var(--card))",
  media: "color-mix(in oklab, var(--info) 20%, var(--card))",
  alta: "color-mix(in oklab, var(--info) 38%, var(--card))",
};

function Matriz() {
  const evento = useEvento();
  const qc = useQueryClient();
  const chave = ["temas", evento.id];
  const dados = useQuery({
    queryKey: chave,
    queryFn: () => temasListar({ data: { eventoId: evento.id } }),
  });
  const [editando, setEditando] = useState<{ id: string | null; dados: Tema } | null>(null);
  const atualizar = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: chave }),
      qc.invalidateQueries({ queryKey: ["acoes", evento.id] }),
    ]);
  const remover = useMutation({
    mutationFn: (id: string) => gestaoRemover({ data: { eventoId: evento.id, tipo: "tema", id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  if (dados.isLoading) return <Carregando />;
  if (!dados.data) return <Falha erro={dados.error} />;
  const temas = dados.data.temas;

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Matriz impacto × relevância"
        description="Classifique cada tema pelo impacto do evento (1 a 5) e pela relevância para as partes interessadas (1 a 5). A soma define a prioridade: 8 ou mais é alta, 6 ou 7 é média. Os temas prioritários orientam o plano de ação e os temas materiais do relatório (GRI 3)."
        actions={
          evento.podeEditar && (
            <Button onClick={() => setEditando({ id: null, dados: VAZIO })}>
              <Plus className="size-4" /> Tema
            </Button>
          )
        }
      />
      <Panel title="Matriz" hint="Passe o mouse sobre um tema para ver a descrição.">
        <div
          className="flex flex-wrap items-center gap-4 pb-3 text-xs text-muted-foreground"
          aria-label="Legenda"
        >
          {(["baixa", "media", "alta"] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-3 rounded-sm border border-border"
                style={{ background: FUNDO[p] }}
              />
              Prioridade {NOME_DA_PRIORIDADE[p].toLowerCase()}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0.5 text-xs">
            <caption className="sr-only">Temas por impacto (linhas) e relevância (colunas)</caption>
            <thead>
              <tr>
                <th className="w-28 p-1 text-left font-medium text-muted-foreground">
                  Impacto ↓ / Relevância →
                </th>
                {ESCALA.map((r) => (
                  <th key={r} className="p-1 text-center font-medium text-muted-foreground">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...ESCALA].reverse().map((imp) => (
                <tr key={imp}>
                  <th className="p-1 text-left font-medium text-muted-foreground">{imp}</th>
                  {ESCALA.map((rel) => {
                    const naCelula = temas.filter((t) => t.impacto === imp && t.relevancia === rel);
                    return (
                      <td
                        key={rel}
                        className="h-20 rounded-md p-1.5 align-top"
                        style={{ background: FUNDO[prioridadeDoTema(imp, rel)] }}
                      >
                        <ul className="space-y-1">
                          {naCelula.map((t) => (
                            <li
                              key={t.id}
                              title={
                                [
                                  t.descricao,
                                  t.stakeholders && `Partes interessadas: ${t.stakeholders}`,
                                ]
                                  .filter(Boolean)
                                  .join("\n") || t.tema
                              }
                              className="truncate rounded bg-card/80 px-1.5 py-0.5 text-foreground"
                            >
                              {t.tema}
                            </li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Temas">
        {temas.length === 0 ? (
          <Vazio>Nenhum tema na matriz.</Vazio>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Tema</th>
                <th className="py-2 pr-3 font-medium">Categoria de emissão</th>
                <th className="py-2 pr-3 text-right font-medium">Impacto</th>
                <th className="py-2 pr-3 text-right font-medium">Relevância</th>
                <th className="py-2 pr-3 font-medium">Prioridade</th>
                <th className="py-2 pr-3 font-medium">Partes interessadas</th>
                {evento.podeEditar && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {temas.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="py-2 pr-3 font-medium">
                    {t.tema}
                    {t.descricao && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {t.descricao}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{t.categoria ?? "Fora do GEE"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.impacto}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{t.relevancia}</td>
                  <td className="py-2 pr-3">{NOME_DA_PRIORIDADE[t.prioridade]}</td>
                  <td className="py-2 pr-3">{t.stakeholders ?? "—"}</td>
                  {evento.podeEditar && (
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const { id, prioridade: _p, ...dados } = t;
                          setEditando({ id, dados });
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remover.isPending}
                        onClick={() =>
                          window.confirm(
                            `Remover o tema “${t.tema}”? As ações ligadas a ele ficam, sem o vínculo.`,
                          ) && remover.mutate(t.id)
                        }
                      >
                        Remover
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {editando && (
        <FormularioDoTema inicial={editando} fechar={() => setEditando(null)} salvo={atualizar} />
      )}
    </>
  );
}

function FormularioDoTema({
  inicial,
  fechar,
  salvo,
}: {
  inicial: { id: string | null; dados: Tema };
  fechar: () => void;
  salvo: () => Promise<unknown>;
}) {
  const evento = useEvento();
  const [d, setD] = useState<Tema>(inicial.dados);
  const mudar = <K extends keyof Tema>(k: K, v: Tema[K]) => setD((x) => ({ ...x, [k]: v }));
  const salvar = useMutation({
    mutationFn: (dados: Tema) =>
      temaSalvar({ data: { eventoId: evento.id, id: inicial.id, dados } }),
    onSuccess: async () => {
      await salvo();
      toast.success("Tema salvo.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = temaSchema.safeParse(d);
    if (!r.success) toast.error(r.error.issues[0]?.message ?? "Revise os campos.");
    else salvar.mutate(r.data);
  };
  const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar tema" : "Novo tema"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-tema">Tema</Label>
            <Input
              id="t-tema"
              required
              maxLength={200}
              value={d.tema}
              onChange={(e) => mudar("tema", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-cat">Categoria de emissão (se o tema for de GEE)</Label>
            <select
              id="t-cat"
              className={sel}
              value={d.categoria ?? ""}
              onChange={(e) => mudar("categoria", e.target.value || null)}
            >
              <option value="">Fora do GEE (social, água, cadeia de suprimentos…)</option>
              {CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-imp">Impacto do evento (1 a 5)</Label>
            <select
              id="t-imp"
              className={sel}
              value={d.impacto}
              onChange={(e) => mudar("impacto", Number(e.target.value))}
            >
              {ESCALA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-rel">Relevância para as partes interessadas (1 a 5)</Label>
            <select
              id="t-rel"
              className={sel}
              value={d.relevancia}
              onChange={(e) => mudar("relevancia", Number(e.target.value))}
            >
              {ESCALA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Prioridade resultante:{" "}
            <strong>{NOME_DA_PRIORIDADE[prioridadeDoTema(d.impacto, d.relevancia)]}</strong>
          </p>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="t-desc">Descrição</Label>
            <Input
              id="t-desc"
              maxLength={2000}
              value={d.descricao ?? ""}
              onChange={(e) => mudar("descricao", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-st">Partes interessadas</Label>
            <Input
              id="t-st"
              maxLength={500}
              value={d.stakeholders ?? ""}
              onChange={(e) => mudar("stakeholders", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-fonte">Fonte da avaliação</Label>
            <Input
              id="t-fonte"
              maxLength={300}
              value={d.fonte ?? ""}
              onChange={(e) => mudar("fonte", e.target.value || null)}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
