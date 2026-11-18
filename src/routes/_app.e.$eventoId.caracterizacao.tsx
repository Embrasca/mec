/**
 * Aba A da Ferramenta: caracterização e enquadramento do evento.
 * O nível é recalculado a cada digitação com o mesmo motor que o servidor usa;
 * o servidor recalcula ao salvar e ao confirmar, e só ele grava o nível oficial.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Carregando,
  Falha,
  formatarData,
  formatarDataHora,
  NivelBadge,
  PageHeader,
  Panel,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { caracterizacaoSchema, type Caracterizacao } from "@/domain/metodologia/caracterizacao";
import { calcularEnquadramento, type Enquadramento } from "@/domain/metodologia/nivel";
import { CRITERIO_LOGISTICA, NIVEIS, V3_16, type Nivel } from "@/domain/metodologia/v3_16";
import { useEvento } from "@/lib/evento-atual";
import { cn } from "@/lib/utils";
import {
  enquadramentoConfirmar,
  enquadramentosListar,
  fichaObter,
  fichaSalvar,
} from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/caracterizacao")({
  head: () => ({ meta: [{ title: "Caracterização e nível" }] }),
  component: Caracterizacao_,
});

const AJUDA = V3_16.ajudaCampos;
type CampoNumerico = {
  [K in keyof Caracterizacao]: Caracterizacao[K] extends number | null ? K : never;
}[keyof Caracterizacao];
type CampoTexto = {
  [K in keyof Caracterizacao]: Caracterizacao[K] extends string | null ? K : never;
}[keyof Caracterizacao];

function Caracterizacao_() {
  const evento = useEvento();
  const qc = useQueryClient();
  const ficha = useQuery({
    queryKey: ["ficha", evento.id],
    queryFn: () => fichaObter({ data: { eventoId: evento.id } }),
  });
  const [dados, setDados] = useState<Caracterizacao | null>(null);
  const [versao, setVersao] = useState(0);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    if (ficha.data && !alterado) {
      setDados(ficha.data.dados);
      setVersao(ficha.data.versao);
    }
  }, [ficha.data, alterado]);

  const { dataInicio, dataFim } = evento;
  const r = useMemo(
    () => (dados ? calcularEnquadramento(dados, { dataInicio, dataFim }) : null),
    [dados, dataInicio, dataFim],
  );

  const salvar = useMutation({
    mutationFn: (d: Caracterizacao) =>
      fichaSalvar({ data: { eventoId: evento.id, versao, dados: d } }),
    onSuccess: (f) => {
      setDados(f.dados);
      setVersao(f.versao);
      setAlterado(false);
      qc.setQueryData(["ficha", evento.id], f);
      toast.success("Ficha salva.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (ficha.isLoading || (!dados && !ficha.error)) return <Carregando />;
  if (ficha.error || !dados || !r) return <Falha erro={ficha.error} />;

  const somenteLeitura = !evento.podeEditar;
  const mudar = <K extends keyof Caracterizacao>(k: K, v: Caracterizacao[K]) => {
    setDados((d) => (d ? { ...d, [k]: v } : d));
    setAlterado(true);
  };
  const num = (
    k: CampoNumerico,
    rotulo: string,
    celula?: string,
    extra?: { max?: number; sufixo?: string },
  ) => (
    <CampoNumero
      id={k}
      rotulo={rotulo}
      ajuda={celula ? AJUDA[celula] : undefined}
      valor={dados[k]}
      max={extra?.max}
      sufixo={extra?.sufixo}
      onChange={(v) => mudar(k, v as never)}
    />
  );
  const opcao = (k: CampoTexto, rotulo: string, opcoes: readonly string[], celula?: string) => (
    <CampoOpcao
      id={k}
      rotulo={rotulo}
      ajuda={celula ? AJUDA[celula] : undefined}
      valor={dados[k]}
      opcoes={opcoes}
      onChange={(v) => mudar(k, v as never)}
    />
  );

  function aoSalvar() {
    const v = caracterizacaoSchema.safeParse(dados);
    if (!v.success) {
      toast.error(v.error.issues[0]?.message ?? "Revise os campos.");
      return;
    }
    salvar.mutate(v.data);
  }

  return (
    <>
      <PageHeader
        eyebrow="Governança · Aba A da Ferramenta"
        title="Caracterização e enquadramento"
        description="Descreva o evento. O nível de exigência é calculado sozinho, com a explicação do porquê. O nível mede impacto, não tamanho."
        actions={
          !somenteLeitura && (
            <Button onClick={aoSalvar} disabled={!alterado || salvar.isPending}>
              {salvar.isPending ? "Salvando…" : alterado ? "Salvar ficha" : "Ficha salva"}
            </Button>
          )
        }
      />
      {somenteLeitura && (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Seu papel neste evento é de consulta.
        </p>
      )}
      {ficha.data?.atualizadoEm && (
        <p className="text-xs text-muted-foreground">
          Última gravação: {formatarDataHora(ficha.data.atualizadoEm)} por{" "}
          {ficha.data.atualizadoPor} (versão {versao}).
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={somenteLeitura} className="min-w-0 space-y-6">
          <Panel
            title="A.1 Identificação do evento"
            hint="Vem do cadastro do evento. Altere em “Cadastro do evento”."
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Dado rotulo="Nome do evento" valor={evento.nome} />
              <Dado rotulo="Instituição responsável" valor={evento.instituicao} />
              <Dado rotulo="Cidade e UF" valor={`${evento.cidade} - ${evento.uf}`} />
              <Dado
                rotulo="Período"
                valor={`${formatarData(evento.dataInicio)} a ${formatarData(evento.dataFim)}`}
              />
            </dl>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <CampoNumero
                id="anoInventario"
                rotulo="Ano do evento (inventário)"
                ajuda={AJUDA["C7"]}
                valor={dados.anoInventario}
                placeholder={evento.dataInicio.slice(0, 4)}
                onChange={(v) => mudar("anoInventario", v)}
              />
              <CampoTextoLivre
                id="responsavelGestaoClimatica"
                rotulo="Responsável pela gestão climática"
                valor={dados.responsavelGestaoClimatica}
                onChange={(v) => mudar("responsavelGestaoClimatica", v)}
              />
            </div>
          </Panel>

          <Panel title="A.2 Perfil e operação">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {opcao("formato", "Formato", V3_16.formatos, "C14")}
              {num("participantesDia", "Participantes previstos por dia", "C15")}
              <Calculado rotulo="Dias de evento" valor={r.dias ?? "—"} ajuda={AJUDA["C16"]} />
              {num("participantesTotal", "Participantes previstos no total")}
              {num("percentualAereo", "Percentual com viagem aérea", "C18", {
                max: 100,
                sufixo: "%",
              })}
              {num("diariasHospedagem", "Diárias de hospedagem previstas")}
              {num("fornecedores", "Número de fornecedores previstos", "C20")}
              {num("areaEstruturaM2", "Área de estrutura temporária", "C21", { sufixo: "m²" })}
              {num("potenciaGeradoresKva", "Potência total de geradores", "C22", { sufixo: "kVA" })}
              {num("numeroGeradores", "Número de geradores")}
              {num("locaisSimultaneos", "Número de locais simultâneos")}
              <Calculado
                rotulo="Há participantes internacionais presenciais?"
                valor={r.haInternacionaisPresenciais ? "Sim" : "Não"}
                ajuda={AJUDA["C25"]}
              />
              {opcao(
                "transporteAquaviario",
                "Há transporte aquaviário relevante?",
                V3_16.simNao,
                "C26",
              )}
              {opcao("itinerante", "Evento itinerante ou em várias cidades?", V3_16.simNao, "C27")}
              {num(
                "porcoesAlimentacao",
                "Porções de alimentação previstas (evento inteiro)",
                "C28",
              )}
              {num("residuosKg", "Resíduos previstos", undefined, { sufixo: "kg" })}
              {opcao("alegacao", "Alegação pública pretendida", V3_16.alegacoes)}
            </div>
          </Panel>

          <Panel title="A.2.1 Como o público chega e quantos são" hint={V3_16.notaParticipantes}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Calculado
                rotulo="Avião (%)"
                valor={dados.percentualAereo ?? "—"}
                ajuda="Vem do percentual com viagem aérea"
              />
              {num("pctOnibus", "Ônibus rodoviário ou fretado (%)", "C33", { max: 100 })}
              {num("pctCarro", "Carro, táxi ou aplicativo (%)", "C34", { max: 100 })}
              {num("pctTrem", "Trem ou metrô (%)", "C35", { max: 100 })}
              {num("pctLocal", "Público local: a pé, de bicicleta ou ônibus urbano (%)", "C36", {
                max: 100,
              })}
              {num("pctOutros", "Outros meios (%)", "C37", { max: 100 })}
            </div>
            <Conferencia ok={r.conferenciaModal === "OK"} className="mt-4">
              Total: {r.totalModal}% — {r.conferenciaModal}
            </Conferencia>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Calculado
                rotulo="Participantes únicos"
                valor={dados.participantesTotal ?? "—"}
                ajuda="Vem dos participantes no total"
              />
              {num(
                "participantesDiaSoma",
                "Participantes-dia: soma das presenças de cada dia",
                "C41",
              )}
              {num("acessosCredenciamento", "Acessos previstos no credenciamento", "C42")}
            </div>
          </Panel>

          <Panel
            title="A.2.2 Participação internacional e logística"
            hint={V3_16.notaInternacional}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {num(
                "internacionaisPresenciais",
                "Participantes internacionais presenciais (nº)",
                "C46",
              )}
              {num("internacionaisOnline", "Participantes internacionais só online (nº)", "C47")}
              {num(
                "vooInternacional",
                "Participantes com voo internacional, de ida ou de volta (nº)",
                "C48",
              )}
              {opcao("logistica", "Logística de materiais e equipamentos", V3_16.logistica, "C49")}
            </div>
          </Panel>

          <Etapa1 r={r} />

          <Panel title="A.4 Etapa 2 — Pontuação de complexidade" hint={V3_16.faixasComplexidade}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Critério</th>
                    <th className="py-2 pr-3 font-medium">Opção que descreve o evento</th>
                    <th className="py-2 pr-3 text-right font-medium">Pontos</th>
                    <th className="py-2 font-medium">O que seria 3 pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {V3_16.criteriosComplexidade.map((c, i) => (
                    <tr key={c.rotulo}>
                      <td className="py-2 pr-3 font-medium">{c.rotulo}</td>
                      <td className="py-2 pr-3">
                        {i === CRITERIO_LOGISTICA ? (
                          <span className="text-muted-foreground">
                            {r.opcaoLogistica} (vem da logística acima)
                          </span>
                        ) : (
                          <select
                            aria-label={c.rotulo}
                            value={dados.complexidade[i] ?? ""}
                            onChange={(e) => {
                              const lista = [...dados.complexidade];
                              lista[i] = e.target.value || null;
                              mudar("complexidade", lista);
                            }}
                            className="h-9 w-full min-w-56 rounded-md border border-input bg-transparent px-2 text-sm"
                          >
                            <option value="">Escolha…</option>
                            {c.opcoes.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.pontos[i]}</td>
                      <td className="py-2 text-xs text-muted-foreground">{c.tresPontos}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td className="py-2" colSpan={2}>
                      Total de pontos (de 0 a 30) · Resultado da etapa 2
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.totalPontos}</td>
                    <td className="py-2">Nível {r.etapa2}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {r.divergencias.length > 0 && (
              <div className="mt-4 space-y-1 rounded-lg bg-info-soft p-3 text-sm text-info-text">
                <p className="flex items-center gap-2 font-medium">
                  <Info className="size-4" /> Confira estas escolhas (a decisão é sua; a conta não
                  muda sozinha):
                </p>
                <ul className="list-disc pl-6">
                  {r.divergencias.map((d) => (
                    <li key={d.criterio}>
                      {d.criterio}: {d.motivo}, o que indica pelo menos “{d.indicadaPelosDados}”.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="A.5 Etapa 3 — Gatilhos automáticos" hint={V3_16.notaGatilhos}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Condição verificada</th>
                    <th className="py-2 pr-3 font-medium">Situação no seu evento</th>
                    <th className="py-2 font-medium">Acionado?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.gatilhos.map((g) => (
                    <tr key={g.condicao} className={g.acionado ? "bg-warning-soft/60" : ""}>
                      <td className="py-2 pr-3">{g.condicao}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{g.situacao}</td>
                      <td className="py-2 font-medium">{g.acionado ? "SIM" : "não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm font-semibold">
              Gatilhos acionados: {r.gatilhosAcionados} · Resultado da etapa 3: Nível {r.etapa3}
            </p>
          </Panel>

          <Panel title="A.6 Etapa 4 — Elevação técnica (opcional)">
            <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="elevacaoTecnica">Elevar o nível para</Label>
                <select
                  id="elevacaoTecnica"
                  value={dados.elevacaoTecnica ?? ""}
                  onChange={(e) =>
                    mudar(
                      "elevacaoTecnica",
                      e.target.value ? (Number(e.target.value) as Nivel) : null,
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Sem elevação</option>
                  {NIVEIS.map((n) => (
                    <option key={n} value={n}>
                      Nível {n}
                    </option>
                  ))}
                </select>
              </div>
              <CampoTextoLivre
                id="justificativaElevacao"
                rotulo="Justificativa da elevação"
                valor={dados.justificativaElevacao}
                multilinha
                onChange={(v) => mudar("justificativaElevacao", v)}
              />
            </div>
            <Conferencia ok={r.conferenciaElevacao !== "FALTA A JUSTIFICATIVA"} className="mt-3">
              Conferência: {r.conferenciaElevacao}
            </Conferencia>
          </Panel>

          <Resultado r={r} />
        </fieldset>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Panel title="Nível calculado">
            <div className="space-y-3">
              <NivelBadge nivel={r.nivelFinal} longo />
              {r.determinante && (
                <p className="text-sm text-muted-foreground">Determinado por: {r.determinante}</p>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <Dado rotulo="Etapa 1" valor={r.etapa1 ?? "—"} />
                <Dado rotulo="Etapa 2" valor={r.etapa2} />
                <Dado rotulo="Etapa 3" valor={r.etapa3} />
                <Dado rotulo="Etapa 4" valor={r.elevacao ?? "—"} />
              </dl>
              <p className="border-t border-border pt-3 text-sm">
                Nível oficial: <NivelBadge nivel={evento.nivel} />
              </p>
              {alterado && <p className="text-xs text-warning-text">Há alterações não salvas.</p>}
              {r.pendencias.length > 0 && (
                <ul className="space-y-1 text-xs text-danger-text">
                  {r.pendencias.map((p) => (
                    <li key={p} className="flex gap-1.5">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
          {evento.podeGerir && (
            <Confirmacao
              r={r}
              podeConfirmar={!alterado && versao > 0}
              responsavelSugerido={dados.responsavelGestaoClimatica ?? ""}
            />
          )}
        </aside>
      </div>

      <Historico />
    </>
  );
}

// ---------------------------------------------------------------------

function Etapa1({ r }: { r: Enquadramento }) {
  const faixas = ["Até 80", "De 81 a 250", "De 251 a 1.000", "Acima de 1.000"];
  return (
    <Panel title="A.3 Etapa 1 — Nível pelo número de participantes por dia">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {faixas.map((f, i) => (
            <tr key={f} className={r.etapa1 === i + 1 ? "font-semibold" : "text-muted-foreground"}>
              <td className="py-2 pr-3">{f}</td>
              <td className="py-2 pr-3">Nível {i + 1}</td>
              <td className="py-2 pr-3">{V3_16.designacoes[i]}</td>
              <td className="py-2">{r.etapa1 === i + 1 ? "SIM" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Resultado({ r }: { r: Enquadramento }) {
  const etapas = [
    ["Etapa 1 - participantes por dia", r.etapa1],
    ["Etapa 2 - pontuação de complexidade", r.etapa2],
    ["Etapa 3 - gatilhos automáticos", r.etapa3],
    ["Etapa 4 - elevação técnica", r.elevacao],
  ] as const;
  return (
    <>
      <Panel title="A.7 Resultado do enquadramento">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Etapa</th>
              <th className="py-2 font-medium">Nível que ela indica</th>
              <th className="py-2 font-medium">Foi a etapa que definiu?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {etapas.map(([nome, n], i) => (
              <tr key={nome}>
                <td className="py-2">{nome}</td>
                <td className="py-2">{n ?? "—"}</td>
                <td className="py-2 font-medium">{r.definiu[i] ? "SIM" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm">
          <strong>{r.designacao ?? "Nível ainda não calculado"}</strong>
          {r.determinante && (
            <span className="text-muted-foreground"> · O que determinou: {r.determinante}</span>
          )}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{V3_16.notaImpacto}</p>
      </Panel>
      <Panel title="A.8 O que faria o nível mudar" hint={V3_16.notaSoSobe}>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {r.oQueMudaria.map((m) => (
              <tr key={m.seAcontecer}>
                <td className="py-2 pr-3">{m.seAcontecer}</td>
                <td className="py-2 pr-3">Nível mínimo {m.nivelMinimo}</td>
                <td className={cn("py-2", m.jaE ? "font-medium" : "text-muted-foreground")}>
                  {m.jaE ? "já é" : "ainda não"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function Confirmacao({
  r,
  podeConfirmar,
  responsavelSugerido,
}: {
  r: Enquadramento;
  podeConfirmar: boolean;
  responsavelSugerido: string;
}) {
  const evento = useEvento();
  const qc = useQueryClient();
  const [responsavel, setResponsavel] = useState(responsavelSugerido);
  const [oQueMudou, setOQueMudou] = useState("");
  const [limitacao, setLimitacao] = useState("");
  useEffect(() => setResponsavel((v) => v || responsavelSugerido), [responsavelSugerido]);

  const confirmar = useMutation({
    mutationFn: () =>
      enquadramentoConfirmar({
        data: {
          eventoId: evento.id,
          nivelVisto: r.nivelFinal ?? 0,
          responsavel,
          oQueMudou: oQueMudou.trim() || null,
          limitacaoDeclarada: limitacao.trim() || null,
        },
      }),
    onSuccess: async (res) => {
      toast.success(`Nível ${res.nivel} confirmado.`);
      setOQueMudou("");
      setLimitacao("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["evento", evento.id] }),
        qc.invalidateQueries({ queryKey: ["eventos"] }),
        qc.invalidateQueries({ queryKey: ["enquadramentos", evento.id] }),
        qc.invalidateQueries({ queryKey: ["acompanhamento", evento.id] }),
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  const atual = evento.nivel;
  const calc = r.nivelFinal;
  if (calc === null) return null;
  if (atual !== null && calc <= atual)
    return (
      <Panel title="Enquadramento">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />O nível oficial é {atual}.{" "}
          {calc < atual
            ? "A ficha indica nível menor, mas o nível só sobe, nunca desce."
            : "A ficha confirma o nível."}
        </p>
      </Panel>
    );

  const reenquadramento = atual !== null;
  const bloqueio = !podeConfirmar
    ? "Salve a ficha antes de confirmar."
    : r.pendencias.length > 0
      ? "Resolva as pendências da ficha."
      : !responsavel.trim()
        ? "Informe o responsável."
        : reenquadramento && !oQueMudou.trim()
          ? "Descreva o que mudou no evento."
          : null;

  return (
    <Panel
      title={reenquadramento ? `Reenquadrar: Nível ${atual} → ${calc}` : `Confirmar Nível ${calc}`}
      hint={
        reenquadramento
          ? "O que não der mais tempo de cumprir vira limitação declarada no relatório."
          : "A partir da confirmação, o sistema passa a exigir o que este nível pede."
      }
    >
      <div className="space-y-3">
        <CampoTextoLivre
          id="resp"
          rotulo="Responsável"
          valor={responsavel}
          onChange={(v) => setResponsavel(v ?? "")}
        />
        {reenquadramento && (
          <>
            <CampoTextoLivre
              id="mudou"
              rotulo="O que mudou no evento"
              valor={oQueMudou}
              multilinha
              onChange={(v) => setOQueMudou(v ?? "")}
            />
            <CampoTextoLivre
              id="limitacao"
              rotulo="Limitação declarada (se houver)"
              valor={limitacao}
              multilinha
              onChange={(v) => setLimitacao(v ?? "")}
            />
          </>
        )}
        {bloqueio && <p className="text-xs text-muted-foreground">{bloqueio}</p>}
        <Button
          className="w-full"
          disabled={Boolean(bloqueio) || confirmar.isPending}
          onClick={() => confirmar.mutate()}
        >
          {confirmar.isPending
            ? "Confirmando…"
            : reenquadramento
              ? "Registrar reenquadramento"
              : "Confirmar enquadramento"}
        </Button>
      </div>
    </Panel>
  );
}

function Historico() {
  const evento = useEvento();
  const lista = useQuery({
    queryKey: ["enquadramentos", evento.id],
    queryFn: () => enquadramentosListar({ data: { eventoId: evento.id } }),
  });
  return (
    <Panel
      title="Registro de mudança de nível (reenquadramento)"
      hint="Cada confirmação fica registrada e não pode ser apagada."
    >
      {lista.isLoading && <Carregando />}
      {lista.error && <Falha erro={lista.error} />}
      {lista.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum enquadramento confirmado ainda.</p>
      )}
      {lista.data && lista.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Data</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Nível anterior</th>
                <th className="py-2 pr-3 font-medium">Novo nível</th>
                <th className="py-2 pr-3 font-medium">O que mudou</th>
                <th className="py-2 pr-3 font-medium">Responsável</th>
                <th className="py-2 font-medium">Limitação declarada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.data.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatarDataHora(h.registradoEm)}
                  </td>
                  <td className="py-2 pr-3">
                    {h.tipo === "inicial" ? "Inicial" : "Reenquadramento"}
                  </td>
                  <td className="py-2 pr-3">{h.nivelAnterior ?? "—"}</td>
                  <td className="py-2 pr-3 font-semibold">{h.nivel}</td>
                  <td className="py-2 pr-3">{h.oQueMudou ?? h.determinante ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {h.responsavel}
                    <span className="block text-xs text-muted-foreground">
                      registrado por {h.registradoPor}
                    </span>
                  </td>
                  <td className="py-2">{h.limitacaoDeclarada ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------

function Rotulo({ id, rotulo, ajuda }: { id: string; rotulo: string; ajuda?: string | undefined }) {
  return (
    <>
      <Label htmlFor={id} className="leading-snug">
        {rotulo}
      </Label>
      {ajuda && (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
    </>
  );
}

function CampoNumero({
  id,
  rotulo,
  ajuda,
  valor,
  max,
  sufixo,
  placeholder,
  onChange,
}: {
  id: string;
  rotulo: string;
  ajuda?: string | undefined;
  valor: number | null;
  max?: number | undefined;
  sufixo?: string | undefined;
  placeholder?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Rotulo id={id} rotulo={rotulo} ajuda={ajuda} />
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="any"
          placeholder={placeholder}
          aria-describedby={ajuda ? `${id}-ajuda` : undefined}
          value={valor ?? ""}
          onChange={(e) => {
            const t = e.target.value;
            const n = t === "" ? null : Number(t);
            onChange(n === null || Number.isFinite(n) ? n : null);
          }}
        />
        {sufixo && <span className="text-sm text-muted-foreground">{sufixo}</span>}
      </div>
    </div>
  );
}

function CampoOpcao({
  id,
  rotulo,
  ajuda,
  valor,
  opcoes,
  onChange,
}: {
  id: string;
  rotulo: string;
  ajuda?: string | undefined;
  valor: string | null;
  opcoes: readonly string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Rotulo id={id} rotulo={rotulo} ajuda={ajuda} />
      <select
        id={id}
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="">Escolha…</option>
        {opcoes.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function CampoTextoLivre({
  id,
  rotulo,
  valor,
  multilinha,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: string | null;
  multilinha?: boolean;
  onChange: (v: string | null) => void;
}) {
  const props = {
    id,
    value: valor ?? "",
    onChange: (e: { target: { value: string } }) => onChange(e.target.value || null),
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {multilinha ? <Textarea {...props} maxLength={4000} /> : <Input {...props} maxLength={200} />}
    </div>
  );
}

function Calculado({
  rotulo,
  valor,
  ajuda,
}: {
  rotulo: string;
  valor: ReactNode;
  ajuda?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium leading-snug">{rotulo}</p>
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
      <p
        className="flex h-9 items-center rounded-md bg-muted px-3 text-sm tabular-nums"
        aria-live="polite"
      >
        {valor}
      </p>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}

function Conferencia({
  ok,
  className,
  children,
}: {
  ok: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg p-2.5 text-sm",
        ok ? "bg-success-soft text-success-text" : "bg-warning-soft text-warning-text",
        className,
      )}
    >
      {ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
      {children}
    </p>
  );
}
