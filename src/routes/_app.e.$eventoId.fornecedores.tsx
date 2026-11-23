/** Aba FORNECEDORES da Ferramenta: o que pedir a cada tipo e o que já chegou. */
import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Carregando,
  Falha,
  formatarData,
  PageHeader,
  PainelExpansivel,
  Panel,
  Vazio,
} from "@/components/kit";
import { SeloAlerta } from "@/components/TabelaEditavel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  entregaNoNivel,
  fornecedorSchema,
  NOTA_PRAZO,
  TIPOS,
  type DadosDoFornecedor,
} from "@/domain/metodologia/fornecedores";
import { useEvento } from "@/lib/evento-atual";
import { hojeISO } from "@/lib/formatar";
import { fornecedorRemover, fornecedorSalvar, fornecedoresListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/fornecedores")({
  head: () => ({ meta: [{ title: "Fornecedores" }] }),
  component: Fornecedores,
});

const VAZIO: DadosDoFornecedor = {
  nome: "",
  tipo: "",
  contato: null,
  enviadoEm: null,
  recebidoEm: null,
  haSubcontratados: null,
  subcontratadosIncluidos: null,
  observacao: null,
};

function Fornecedores() {
  const evento = useEvento();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const chave = ["fornecedores", evento.id, hoje];
  const lista = useQuery({
    queryKey: chave,
    queryFn: () => fornecedoresListar({ data: { eventoId: evento.id, hoje } }),
  });
  const [editando, setEditando] = useState<{ id: string | null; dados: DadosDoFornecedor } | null>(
    null,
  );
  const remover = useMutation({
    mutationFn: (id: string) => fornecedorRemover({ data: { eventoId: evento.id, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fornecedores", evento.id] }),
    onError: (e) => toast.error(e.message),
  });
  const entrega = entregaNoNivel(evento.nivel);

  return (
    <>
      <PageHeader
        eyebrow="Pré-evento · Aba FORNECEDORES da Ferramenta"
        title="Fornecedores"
        description="O que pedir a cada tipo de fornecedor e o acompanhamento do que já chegou. O fornecedor contratado consolida e entrega os dados dos seus subcontratados."
      />
      <PainelExpansivel
        title={`Parte 1 — O que pedir a cada tipo de fornecedor (${TIPOS.length} tipos)`}
      >
        <p className="mb-3 text-xs text-muted-foreground">{NOTA_PRAZO}</p>
        <p className="mb-4 rounded-lg bg-info-soft p-3 text-sm text-info-text">
          {entrega ? (
            <>
              <strong>No Nível {evento.nivel}, o fornecedor entrega:</strong> {entrega}
            </>
          ) : (
            "Confirme o nível na caracterização para ver o que o fornecedor deve entregar."
          )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Tipo de fornecedor</th>
                <th className="py-2 pr-3 font-medium">O que pedir</th>
                <th className="py-2 pr-3 font-medium">Unidade</th>
                <th className="py-2 font-medium">Comprovante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {TIPOS.map((t) => (
                <tr key={t.tipo} className="align-top">
                  <td className="py-2 pr-3 font-medium">{t.tipo}</td>
                  <td className="py-2 pr-3">{t.oQuePedir}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{t.unidade}</td>
                  <td className="py-2">{t.comprovante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PainelExpansivel>

      <Panel
        title="Parte 2 — Acompanhamento por fornecedor"
        actions={
          evento.podeEditar && (
            <Button size="sm" onClick={() => setEditando({ id: null, dados: VAZIO })}>
              <Plus className="size-4" /> Fornecedor
            </Button>
          )
        }
      >
        {lista.isLoading && <Carregando />}
        {lista.error && <Falha erro={lista.error} />}
        {lista.data?.fornecedores.length === 0 && <Vazio>Nenhum fornecedor cadastrado.</Vazio>}
        {lista.data && lista.data.fornecedores.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Fornecedor</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Enviado em</th>
                  <th className="py-2 pr-3 font-medium">Prazo</th>
                  <th className="py-2 pr-3 font-medium">Recebido em</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 pr-3 font-medium">Alerta</th>
                  <th className="py-2 pr-3 text-right font-medium">Linhas no ex-ante</th>
                  {evento.podeEditar && <th className="py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.data.fornecedores.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2 pr-3 font-medium">
                      {f.nome}
                      {f.contato && (
                        <span className="block text-xs text-muted-foreground">{f.contato}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{f.tipo}</td>
                    <td className="py-2 pr-3">{f.enviadoEm ? formatarData(f.enviadoEm) : "—"}</td>
                    <td className="py-2 pr-3">{formatarData(f.prazo)}</td>
                    <td className="py-2 pr-3">{f.recebidoEm ? formatarData(f.recebidoEm) : "—"}</td>
                    <td className="py-2 pr-3">{f.situacao}</td>
                    <td className="py-2 pr-3">
                      <SeloAlerta texto={f.alerta} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{f.linhasExAnte}</td>
                    {evento.podeEditar && (
                      <td className="py-2 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const {
                              id,
                              prazo: _p,
                              situacao: _s,
                              alerta: _a,
                              linhasExAnte: _x,
                              linhasExPost: _y,
                              ...dados
                            } = f;
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
                            window.confirm(`Remover ${f.nome}?`) && remover.mutate(f.id)
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
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Prazo: término do evento ({formatarData(evento.dataFim)}) + 5 dias. As linhas contam os
          itens do inventário lançados com o mesmo tipo de fornecedor.
        </p>
      </Panel>

      {editando && (
        <FormularioDoFornecedor
          inicial={editando}
          fechar={() => setEditando(null)}
          salvo={() => qc.invalidateQueries({ queryKey: ["fornecedores", evento.id] })}
        />
      )}
    </>
  );
}

function FormularioDoFornecedor({
  inicial,
  fechar,
  salvo,
}: {
  inicial: { id: string | null; dados: DadosDoFornecedor };
  fechar: () => void;
  salvo: () => Promise<unknown>;
}) {
  const evento = useEvento();
  const [d, setD] = useState<DadosDoFornecedor>(inicial.dados);
  const salvar = useMutation({
    mutationFn: (dados: DadosDoFornecedor) =>
      fornecedorSalvar({ data: { eventoId: evento.id, id: inicial.id, dados } }),
    onSuccess: async () => {
      await salvo();
      toast.success("Fornecedor salvo.");
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });
  const mudar = <K extends keyof DadosDoFornecedor>(k: K, v: DadosDoFornecedor[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = fornecedorSchema.safeParse(d);
    if (!r.success) toast.error(r.error.issues[0]?.message ?? "Revise os campos.");
    else salvar.mutate(r.data);
  };
  const selecao = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{inicial.id ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-nome">Fornecedor</Label>
            <Input
              id="f-nome"
              required
              maxLength={200}
              value={d.nome}
              onChange={(e) => mudar("nome", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-tipo">Tipo</Label>
            <select
              id="f-tipo"
              value={d.tipo}
              onChange={(e) => mudar("tipo", e.target.value)}
              className={selecao}
            >
              <option value="">Escolha…</option>
              {TIPOS.map((t) => (
                <option key={t.tipo}>{t.tipo}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-contato">Contato</Label>
            <Input
              id="f-contato"
              maxLength={200}
              value={d.contato ?? ""}
              onChange={(e) => mudar("contato", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-enviado">Enviado em</Label>
            <Input
              id="f-enviado"
              type="date"
              value={d.enviadoEm ?? ""}
              onChange={(e) => mudar("enviadoEm", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-recebido">Recebido em</Label>
            <Input
              id="f-recebido"
              type="date"
              value={d.recebidoEm ?? ""}
              onChange={(e) => mudar("recebidoEm", e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-sub">Há subcontratados?</Label>
            <select
              id="f-sub"
              value={d.haSubcontratados ?? ""}
              onChange={(e) => mudar("haSubcontratados", (e.target.value || null) as never)}
              className={selecao}
            >
              <option value="">—</option>
              <option>Sim</option>
              <option>Não</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-inc">Dados dos subcontratados incluídos?</Label>
            <select
              id="f-inc"
              value={d.subcontratadosIncluidos ?? ""}
              onChange={(e) => mudar("subcontratadosIncluidos", (e.target.value || null) as never)}
              className={selecao}
            >
              <option value="">—</option>
              <option>Sim</option>
              <option>Não</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-obs">Observação</Label>
            <Input
              id="f-obs"
              maxLength={2000}
              value={d.observacao ?? ""}
              onChange={(e) => mudar("observacao", e.target.value || null)}
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
