/** Aba "6 - EMISSÕES RESIDUAIS" da Ferramenta: as contas da compensação. */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Carregando, Falha, PageHeader, Panel } from "@/components/kit";
import { AvisoDoExPost } from "@/components/telas/PosEvento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AVISOS_DA_COMPENSACAO,
  calcularCompensacao,
  compensacaoSchema,
  type Compensacao,
} from "@/domain/metodologia/posEvento";
import { useEvento } from "@/lib/evento-atual";
import { numero } from "@/lib/formatar";
import { cn } from "@/lib/utils";
import { compensacaoSalvar, posEventoObter } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/compensacao")({
  head: () => ({ meta: [{ title: "Emissões residuais e compensação" }] }),
  component: CompensacaoDoEvento,
});

const paraNumero = (v: string) => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function CompensacaoDoEvento() {
  const evento = useEvento();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pos-evento", evento.id],
    queryFn: () => posEventoObter({ data: { eventoId: evento.id } }),
  });
  const [d, setD] = useState<Compensacao | null>(null);
  const [alterado, setAlterado] = useState(false);
  useEffect(() => {
    if (q.data && !alterado) {
      const { versao: _v, ...dados } = q.data.compensacao;
      setD(dados);
    }
  }, [q.data, alterado]);
  const salvar = useMutation({
    mutationFn: (dados: Compensacao) =>
      compensacaoSalvar({
        data: { eventoId: evento.id, versao: q.data!.compensacao.versao, dados },
      }),
    onSuccess: async () => {
      setAlterado(false);
      await qc.invalidateQueries({ queryKey: ["pos-evento", evento.id] });
      toast.success("Compensação salva.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (q.isLoading || (!d && !q.error)) return <Carregando />;
  if (!q.data || !d) return <Falha erro={q.error} />;
  const total = q.data.resultados.principais.total;
  const s = calcularCompensacao(total, d);
  const ro = !evento.podeEditar;
  const mudar = <K extends keyof Compensacao>(k: K, v: Compensacao[K]) => {
    setD((x) => (x ? { ...x, [k]: v } : x));
    setAlterado(true);
  };
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const r = compensacaoSchema.safeParse(d);
    if (!r.success) toast.error(r.error.issues[0]?.message ?? "Revise os campos.");
    else salvar.mutate(r.data);
  };

  return (
    <>
      <PageHeader
        eyebrow="Pós-evento · Aba 6 da Ferramenta"
        title="Emissões residuais e saldo a compensar"
        description="Aqui ficam as contas da compensação. Os documentos que a comprovam formam o dossiê de compensação, descrito no capítulo 8 do Guia."
      />
      <AvisoDoExPost
        existe={q.data.exPost.existe}
        fechadoEm={q.data.exPost.fechadoEm}
        eventoId={evento.id}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="As contas">
          <dl className="divide-y divide-border text-sm">
            <Conta rotulo="Emissões brutas do evento" valor={`${numero(s.brutas, 3)} tCO₂e`}>
              Total do inventário ex-post.
            </Conta>
            <Conta rotulo="Reduções já refletidas no total acima" valor="—">
              {AVISOS_DA_COMPENSACAO[0]}
            </Conta>
            <Conta rotulo="Emissões residuais" valor={`${numero(s.residuais, 3)} tCO₂e`}>
              É o próprio total bruto.
            </Conta>
            <Conta rotulo="Quantidade a compensar" valor={`${numero(s.aCompensar, 0)} t`}>
              Em toneladas inteiras, sempre arredondada para cima.
            </Conta>
            <Conta
              rotulo="Quantidade efetivamente aposentada"
              valor={`${numero(d.aposentadaT ?? 0, 3)} tCO₂e`}
            >
              Aposentadoria comprovada, não apenas compra.
            </Conta>
            <Conta rotulo="Saldo ainda não compensado" valor={`${numero(s.saldo, 3)} tCO₂e`} />
          </dl>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="text-sm font-medium">A compensação está completa?</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                s.completa.startsWith("SIM")
                  ? "bg-success-soft text-success-text"
                  : "bg-warning-soft text-warning-text",
              )}
            >
              {s.completa}
            </span>
          </div>
        </Panel>

        <Panel title="O que preencher">
          <form onSubmit={enviar}>
            <fieldset disabled={ro} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-aposentada">Quantidade efetivamente aposentada (tCO₂e)</Label>
                <Input
                  id="c-aposentada"
                  type="number"
                  min={0}
                  step="any"
                  value={d.aposentadaT ?? ""}
                  onChange={(e) => mudar("aposentadaT", paraNumero(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-comprovante">Comprovante da aposentadoria</Label>
                <Input
                  id="c-comprovante"
                  maxLength={2000}
                  placeholder="Registro, projeto, número de série ou arquivo do certificado"
                  value={d.comprovante ?? ""}
                  onChange={(e) => mudar("comprovante", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-omissao">Parcela não abatida por omissão (tCO₂e)</Label>
                <Input
                  id="c-omissao"
                  type="number"
                  min={0}
                  step="any"
                  value={d.omissaoT ?? ""}
                  onChange={(e) => mudar("omissaoT", paraNumero(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Se havia medida viável e ela não foi adotada por esquecimento, registre aqui. Será
                  compensada igual, mas fica declarada.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-omissao-desc">Qual medida deixou de ser adotada</Label>
                <Input
                  id="c-omissao-desc"
                  maxLength={2000}
                  value={d.omissaoDescricao ?? ""}
                  onChange={(e) => mudar("omissaoDescricao", e.target.value || null)}
                />
              </div>
              {s.pendencias.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-warning-soft p-3 text-sm text-warning-text">
                  {s.pendencias.map((p) => (
                    <li key={p} className="flex items-center gap-2">
                      <AlertTriangle className="size-4 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              )}
              {!ro && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={!alterado || salvar.isPending}>
                    {salvar.isPending ? "Salvando…" : alterado ? "Salvar" : "Salvo"}
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
        </Panel>
      </div>
      <Panel title="Lembre-se">
        <ul className="space-y-2 text-sm">
          {AVISOS_DA_COMPENSACAO.slice(1).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Conta({
  rotulo,
  valor,
  children,
}: {
  rotulo: string;
  valor: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <dt className="font-medium">{rotulo}</dt>
        {children && <dd className="text-xs text-muted-foreground">{children}</dd>}
      </div>
      <dd className="shrink-0 font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
