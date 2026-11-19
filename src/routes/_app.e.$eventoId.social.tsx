/** Responsabilidade social (RS1 a RS5): ações com a comunidade, acessibilidade e cuidado com o público. */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Anexos, CartoesDeIndicadores, useAtualizarEsg, useEsg } from "@/components/esg";
import { FormularioDeCampos, type Campo } from "@/components/FormularioDeCampos";
import { Carregando, Falha, formatarData, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acaoSocialSchema,
  RECURSOS_DE_ACESSIBILIDADE,
  TIPOS_DE_ACAO,
  type AcaoSocial,
  type RegistroEsg,
} from "@/domain/esg/esquemas";
import { useEvento } from "@/lib/evento-atual";
import { esgRemoverItem, esgSalvarItem, esgSalvarRegistro } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/social")({
  head: () => ({ meta: [{ title: "Responsabilidade social" }] }),
  component: Social,
});

const CAMPOS: Campo<AcaoSocial>[] = [
  { chave: "tipo", rotulo: "Tipo", tipo: "opcao", opcoes: TIPOS_DE_ACAO, vazio: false },
  { chave: "data", rotulo: "Data", tipo: "data" },
  { chave: "descricao", rotulo: "Descrição", tipo: "texto", max: 1000, largo: true },
  { chave: "parceiro", rotulo: "Parceiro", tipo: "texto", max: 200 },
  { chave: "local", rotulo: "Local", tipo: "texto", max: 200 },
  {
    chave: "pessoasBeneficiadas",
    rotulo: "Pessoas beneficiadas",
    tipo: "inteiro",
    ajuda: "Sem contar a mesma pessoa duas vezes na mesma ação.",
  },
  { chave: "alimentosKg", rotulo: "Alimentos doados (kg)", tipo: "numero" },
  { chave: "itensDoados", rotulo: "Itens doados", tipo: "inteiro" },
  { chave: "instituicaoReceptora", rotulo: "Instituição que recebeu", tipo: "texto", max: 200 },
  { chave: "evidencia", rotulo: "Referência da evidência", tipo: "texto", largo: true },
];

const acaoVazia = (): AcaoSocial => ({
  tipo: "Engajamento comunitário",
  descricao: "",
  parceiro: null,
  local: null,
  data: null,
  pessoasBeneficiadas: null,
  alimentosKg: null,
  itensDoados: null,
  instituicaoReceptora: null,
  evidencia: null,
});

function Social() {
  const evento = useEvento();
  const esg = useEsg();
  const atualizar = useAtualizarEsg();
  const [acao, setAcao] = useState<{ id: string | null; dados: AcaoSocial } | null>(null);
  const remover = useMutation({
    mutationFn: (id: string) =>
      esgRemoverItem({ data: { eventoId: evento.id, lista: "acao_social", id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });
  if (esg.isLoading) return <Carregando />;
  if (!esg.data) return <Falha erro={esg.error} />;
  const { acoes, indicadores, registro } = esg.data;

  return (
    <>
      <PageHeader
        eyebrow="ESG · Responsabilidade social"
        title="Responsabilidade social"
        description="Ações com a comunidade, doações, acessibilidade e cuidado com o público."
        actions={
          evento.podeEditar && (
            <Button onClick={() => setAcao({ id: null, dados: acaoVazia() })}>
              <Plus className="size-4" /> Ação social
            </Button>
          )
        }
      />
      <Panel title="Ações sociais">
        {acoes.length === 0 ? (
          <Vazio>Nenhuma ação registrada.</Vazio>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {acoes.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{a.descricao}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.tipo}
                      {a.parceiro ? ` · ${a.parceiro}` : ""}
                      {a.data ? ` · ${formatarData(a.data)}` : ""}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {a.pessoasBeneficiadas ?? "—"} pessoas
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const { id, ...dados } = a;
                        setAcao({ id, dados });
                      }}
                    >
                      {evento.podeEditar ? "Editar" : "Ver"}
                    </Button>
                    {evento.podeEditar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.confirm("Remover esta ação?") && remover.mutate(a.id)}
                      >
                        Remover
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <AcessibilidadeEBemEstar inicial={registro.dados} versao={registro.versao} />

      <CartoesDeIndicadores indicadores={indicadores.filter((i) => i.eixo === "rs")} />

      {acao && (
        <FormularioDeCampos<AcaoSocial>
          titulo={acao.id ? "Ação social" : "Nova ação social"}
          campos={CAMPOS}
          inicial={acao.dados}
          schema={acaoSocialSchema}
          somenteLeitura={!evento.podeEditar}
          fechar={() => setAcao(null)}
          salvar={async (dados) => {
            await esgSalvarItem({
              data: { eventoId: evento.id, lista: "acao_social", id: acao.id, dados },
            });
            await atualizar();
            toast.success("Ação salva.");
          }}
          rodape={acao.id ? <Anexos entidade="acao_social" entidadeId={acao.id} /> : undefined}
        />
      )}
    </>
  );
}

function AcessibilidadeEBemEstar({ inicial, versao }: { inicial: RegistroEsg; versao: number }) {
  const evento = useEvento();
  const atualizar = useAtualizarEsg();
  const [d, setD] = useState(inicial);
  const [alterado, setAlterado] = useState(false);
  useEffect(() => {
    if (!alterado) setD(inicial);
  }, [inicial, alterado]);
  const salvar = useMutation({
    mutationFn: () => esgSalvarRegistro({ data: { eventoId: evento.id, versao, dados: d } }),
    onSuccess: async () => {
      setAlterado(false);
      await atualizar();
      toast.success("Registro salvo.");
    },
    onError: (e) => toast.error(e.message),
  });
  const mudar = (f: (x: RegistroEsg) => RegistroEsg) => {
    setD(f);
    setAlterado(true);
  };
  const ro = !evento.podeEditar;
  const sel = "h-8 rounded-md border border-input bg-transparent px-2 text-sm";
  const simNao = (v: boolean | null, aoMudar: (v: boolean | null) => void, rotulo: string) => (
    <select
      aria-label={rotulo}
      className={sel}
      disabled={ro}
      value={v === true ? "Sim" : v === false ? "Não" : ""}
      onChange={(e) => aoMudar(e.target.value === "" ? null : e.target.value === "Sim")}
    >
      <option value="">—</option>
      <option>Sim</option>
      <option>Não</option>
    </select>
  );
  const inteiro = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.trunc(Number(v)) || 0));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel
        title="Recursos de acessibilidade"
        hint="O que foi oferecido e quantas pessoas usaram."
      >
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {RECURSOS_DE_ACESSIBILIDADE.map((k) => {
              const r = d.acessibilidade[k] ?? { oferecido: null, pessoas: null };
              const inviavel = k === "Piso tátil" && d.pisoTatilViavel === false;
              return (
                <tr key={k}>
                  <td className="py-2 pr-3">{k}</td>
                  <td className="py-2 pr-3">
                    {inviavel ? (
                      <span className="text-xs text-muted-foreground">Estrutura não comporta</span>
                    ) : (
                      simNao(
                        r.oferecido,
                        (v) =>
                          mudar((x) => ({
                            ...x,
                            acessibilidade: { ...x.acessibilidade, [k]: { ...r, oferecido: v } },
                          })),
                        `${k}: oferecido`,
                      )
                    )}
                  </td>
                  <td className="py-2">
                    <Input
                      aria-label={`${k}: pessoas que usaram`}
                      type="number"
                      min={0}
                      placeholder="pessoas"
                      disabled={ro || inviavel || !r.oferecido}
                      className="h-8 w-24"
                      value={r.pessoas ?? ""}
                      onChange={(e) =>
                        mudar((x) => ({
                          ...x,
                          acessibilidade: {
                            ...x.acessibilidade,
                            [k]: { ...r, pessoas: inteiro(e.target.value) },
                          },
                        }))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Label htmlFor="piso">A estrutura do evento comporta piso tátil?</Label>
          {simNao(d.pisoTatilViavel, (v) => mudar((x) => ({ ...x, pisoTatilViavel: v })), "piso")}
        </div>
      </Panel>
      <Panel title="Segurança e bem-estar do público">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          {(
            [
              ["protocoloAssedio", "Protocolo contra assédio"],
              ["atendimentoSaude", "Atendimento de saúde no local"],
              ["aguaGratuita", "Água potável gratuita"],
            ] as const
          ).map(([k, rotulo]) => (
            <div key={k} className="flex items-center justify-between gap-2 sm:col-span-2">
              <span>{rotulo}</span>
              {simNao(
                d.bemEstar[k],
                (v) => mudar((x) => ({ ...x, bemEstar: { ...x.bemEstar, [k]: v } })),
                rotulo,
              )}
            </div>
          ))}
          {(
            [
              ["atendimentosDeSaude", "Atendimentos de saúde"],
              ["casosRegistrados", "Casos de assédio ou violência registrados"],
            ] as const
          ).map(([k, rotulo]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`b-${k}`}>{rotulo}</Label>
              <Input
                id={`b-${k}`}
                type="number"
                min={0}
                disabled={ro}
                value={d.bemEstar[k] ?? ""}
                onChange={(e) =>
                  mudar((x) => ({
                    ...x,
                    bemEstar: { ...x.bemEstar, [k]: inteiro(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <Anexos entidade="registro_esg" entidadeId="RS5" />
        </div>
      </Panel>
      {!ro && (
        <div className="flex justify-end lg:col-span-2">
          <Button disabled={!alterado || salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending
              ? "Salvando…"
              : alterado
                ? "Salvar acessibilidade e bem-estar"
                : "Salvo"}
          </Button>
        </div>
      )}
    </div>
  );
}
