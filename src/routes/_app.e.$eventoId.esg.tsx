/** Painel dos 27 indicadores ESG: área local, pendências dos essenciais e "não se aplica". */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SeloEsg, useAtualizarEsg, useEsg } from "@/components/esg";
import { Carregando, Falha, PageHeader, PainelExpansivel, Panel } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EIXOS_ESG, type IndicadorCalculado } from "@/domain/esg/indicadores";
import { useEvento } from "@/lib/evento-atual";
import { cn } from "@/lib/utils";
import { esgSalvarRegistro } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/esg")({
  head: () => ({ meta: [{ title: "Indicadores ESG" }] }),
  component: PainelEsg,
});

const TELA = {
  ml: "/e/$eventoId/mao-de-obra",
  cs: "/e/$eventoId/cadeia",
  rs: "/e/$eventoId/social",
  ps: "/e/$eventoId/pesquisa",
} as const;

function PainelEsg() {
  const evento = useEvento();
  const esg = useEsg();
  const atualizar = useAtualizarEsg();
  const [marcando, setMarcando] = useState<IndicadorCalculado | null>(null);
  const salvarNsa = useMutation({
    mutationFn: (v: { id: string; justificativa: string | null }) => {
      const r = esg.data!.registro;
      const naoSeAplica = { ...r.dados.naoSeAplica };
      if (v.justificativa) naoSeAplica[v.id] = { justificativa: v.justificativa };
      else delete naoSeAplica[v.id];
      return esgSalvarRegistro({
        data: { eventoId: evento.id, versao: r.versao, dados: { ...r.dados, naoSeAplica } },
      });
    },
    onSuccess: async () => {
      setMarcando(null);
      await atualizar();
      toast.success("Indicador atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });
  if (esg.isLoading) return <Carregando />;
  if (!esg.data) return <Falha erro={esg.error} />;
  const { indicadores, pendencias, area } = esg.data;

  return (
    <>
      <PageHeader
        eyebrow="ESG · além do GEE"
        title="Indicadores ESG"
        description="Os 27 indicadores aprovados para mão de obra local, cadeia de suprimentos, responsabilidade social e pesquisa de satisfação. Os essenciais são obrigatórios em todos os níveis: sem eles o relatório final não é gerado."
      />
      <p className="rounded-lg bg-info-soft p-3 text-sm text-info-text">
        Área local do evento: {area.descricao}. Conta como local o mesmo município ou a mesma região
        metropolitana; fora de região metropolitana, a região imediata do IBGE.
      </p>
      {pendencias.length ? (
        <Panel title={`${pendencias.length} indicador(es) essencial(is) pendente(s)`}>
          <ul className="space-y-2 text-sm">
            {pendencias.map((p) => (
              <li key={p.id} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-text" />
                <span>
                  <strong>
                    {p.id} {p.nome}:
                  </strong>{" "}
                  {p.pendencias.join(" ")}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success-text">
          <CheckCircle2 className="size-4" /> Todos os indicadores essenciais estão completos ou
          justificados.
        </p>
      )}
      {EIXOS_ESG.map((e) => {
        const doEixo = indicadores.filter((i) => i.eixo === e.id);
        const abertos = doEixo.filter(
          (i) => i.essencial && (i.situacao === "pendente" || i.situacao === "sem_dados"),
        ).length;
        return (
          <PainelExpansivel
            key={e.id}
            title={`${e.nome} — ${doEixo.length} indicadores`}
            resumo={
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  abertos
                    ? "bg-warning-soft text-warning-text"
                    : "bg-success-soft text-success-text",
                )}
              >
                {abertos ? `${abertos} essencial(is) pendente(s)` : "Essenciais em dia"}
              </span>
            }
            actions={
              <Button asChild size="sm" variant="outline">
                <Link to={TELA[e.id]} params={{ eventoId: evento.id }}>
                  Abrir
                </Link>
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <tbody className="divide-y divide-border align-top">
                  {doEixo.map((i) => (
                    <tr key={i.id}>
                      <td className="w-12 py-2 pr-2 font-mono text-xs text-muted-foreground">
                        {i.id}
                      </td>
                      <td className="py-2 pr-3">
                        {i.nome}
                        {i.essencial && (
                          <span className="ml-1.5 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info-text">
                            ESSENCIAL
                          </span>
                        )}
                        {i.justificativa && (
                          <span className="block text-xs text-muted-foreground">
                            Não se aplica: {i.justificativa}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{i.valor ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <SeloEsg situacao={i.situacao} />
                      </td>
                      <td className="py-2 text-right">
                        {i.essencial && evento.podeEditar && i.situacao !== "ok" && (
                          <Button size="sm" variant="ghost" onClick={() => setMarcando(i)}>
                            {i.justificativa ? "Rever" : "Não se aplica"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PainelExpansivel>
        );
      })}
      {marcando && (
        <NaoSeAplica
          indicador={marcando}
          salvando={salvarNsa.isPending}
          fechar={() => setMarcando(null)}
          salvar={(justificativa) => salvarNsa.mutate({ id: marcando.id, justificativa })}
        />
      )}
    </>
  );
}

function NaoSeAplica({
  indicador,
  salvando,
  fechar,
  salvar,
}: {
  indicador: IndicadorCalculado;
  salvando: boolean;
  fechar: () => void;
  salvar: (justificativa: string | null) => void;
}) {
  const [texto, setTexto] = useState(indicador.justificativa ?? "");
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {indicador.id} {indicador.nome}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Use só quando o indicador realmente não se aplica ao evento (por exemplo, evento sem
            fornecedores contratados). A justificativa aparece no relatório.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="nsa">Justificativa</Label>
            <Textarea
              id="nsa"
              rows={3}
              maxLength={1000}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div className="flex justify-between gap-2">
            {indicador.justificativa ? (
              <Button variant="ghost" disabled={salvando} onClick={() => salvar(null)}>
                Voltar a exigir
              </Button>
            ) : (
              <span />
            )}
            <Button
              disabled={salvando || texto.trim().length < 5}
              onClick={() => salvar(texto.trim())}
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
