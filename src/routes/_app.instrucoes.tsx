/** Aba INÍCIO da Ferramenta: o caminho, os níveis e as regras gerais. */
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/Shell";
import { NivelBadge, PageHeader, Panel } from "@/components/kit";
import { NIVEIS, V3_16 } from "@/domain/metodologia/v3_16";

export const Route = createFileRoute("/_app/instrucoes")({
  head: () => ({ meta: [{ title: "Instruções" }] }),
  component: Instrucoes,
});

function Instrucoes() {
  return (
    <Shell>
      <PageHeader
        eyebrow="Governança"
        title="Instruções"
        description={`Baseado na ${V3_16.fonte}, versão 3.16. Assim que o nível é calculado na caracterização, o sistema se ajusta a ele.`}
      />
      <Panel title="Os quatro níveis" hint={V3_16.notaImpacto}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {NIVEIS.map((n) => (
            <li
              key={n}
              className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <NivelBadge nivel={n} />
              {V3_16.designacoes[n - 1]}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Como o nível é definido">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Etapa 1 — participantes por dia: até 80, até 250, até 1.000 ou acima de 1.000.</li>
          <li>Etapa 2 — pontuação de complexidade em 10 critérios ({V3_16.faixasComplexidade}).</li>
          <li>Etapa 3 — gatilhos automáticos. {V3_16.notaGatilhos}</li>
          <li>Etapa 4 — elevação técnica opcional, sempre com justificativa.</li>
        </ol>
        <p className="mt-3 text-sm">Vale o maior nível entre as etapas. {V3_16.notaSoSobe}</p>
      </Panel>
      <Panel
        title="O caminho, etapa por etapa"
        hint="As etapas marcadas como próximas versões ainda não estão no sistema."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Fase</th>
                <th className="py-2 pr-3 font-medium">Etapa (aba da Ferramenta)</th>
                <th className="py-2 pr-3 font-medium">O que fazer</th>
                <th className="py-2 pr-3 font-medium">No Guia</th>
                <th className="py-2 font-medium">No sistema</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {V3_16.roteiro.map((p) => (
                <tr key={p.aba}>
                  <td className="py-2 pr-3 whitespace-nowrap">{p.fase}</td>
                  <td className="py-2 pr-3 font-medium">{p.aba}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.oQueFazer}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-xs">{p.noGuia}</td>
                  <td className="py-2 text-xs">{NO_SISTEMA[p.aba] ?? "Próximas versões"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Shell>
  );
}

const NO_SISTEMA: Record<string, string> = {
  "A - CARACTERIZAÇÃO": "Caracterização e nível",
  "B - ACOMPANHAMENTO": "Requisitos do nível",
  FORNECEDORES: "Fornecedores",
  "1 - EVENTO": "Cadastro do evento e caracterização",
  "2 - EX-ANTE": "Inventário ex-ante",
  REDUÇÃO: "Plano de redução",
  "C - CHECKLIST": "Checklist do nível",
  COLETA: "Coleta (previsão, para o ex-ante)",
  "FATORES e LISTAS": "Base de fatores",
};
