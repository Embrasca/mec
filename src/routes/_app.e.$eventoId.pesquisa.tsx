/** Pesquisa de satisfação (PS1 a PS7): link público, importação de planilha e resultados. */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { CartoesDeIndicadores, useAtualizarEsg, useEsg } from "@/components/esg";
import { Carregando, Falha, formatarDataHora, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { importarRespostas, MODELO_CSV, type ResultadoDaImportacao } from "@/domain/esg/importacao";
import { nomeDoMunicipio } from "@/domain/territorio";
import { useEvento } from "@/lib/evento-atual";
import {
  pesquisaConfigurar,
  pesquisaDesfazerImportacao,
  pesquisaDestacar,
  pesquisaImportar,
} from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/pesquisa")({
  head: () => ({ meta: [{ title: "Pesquisa de satisfação" }] }),
  component: Pesquisa,
});

function Pesquisa() {
  const evento = useEvento();
  const esg = useEsg();
  const atualizar = useAtualizarEsg();
  const [previa, setPrevia] = useState<ResultadoDaImportacao | null>(null);
  const configurar = useMutation({
    mutationFn: (v: { aberta: boolean; nps: boolean; novoLink?: boolean }) =>
      pesquisaConfigurar({ data: { eventoId: evento.id, ...v } }),
    onSuccess: async () => {
      await atualizar();
      toast.success("Pesquisa atualizada.");
    },
    onError: (e) => toast.error(e.message),
  });
  const importar = useMutation({
    mutationFn: (r: ResultadoDaImportacao) =>
      pesquisaImportar({ data: { eventoId: evento.id, respostas: r.respostas } }),
    onSuccess: async (r) => {
      setPrevia(null);
      await atualizar();
      toast.success(`${r.importadas} resposta(s) importada(s).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const desfazer = useMutation({
    mutationFn: (importacaoId: string) =>
      pesquisaDesfazerImportacao({ data: { eventoId: evento.id, importacaoId } }),
    onSuccess: async (r) => {
      await atualizar();
      toast.success(`${r.removidas} resposta(s) removida(s).`);
    },
    onError: (e) => toast.error(e.message),
  });
  const destacar = useMutation({
    mutationFn: (v: { respostaId: string; destaque: boolean }) =>
      pesquisaDestacar({ data: { eventoId: evento.id, ...v } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  const respostas = useMemo(() => esg.data?.pesquisa.respostas ?? [], [esg.data]);
  const importacoes = useMemo(() => {
    const m = new Map<string, { n: number; em: string }>();
    for (const r of respostas)
      if (r.importacaoId) {
        const x = m.get(r.importacaoId) ?? { n: 0, em: r.recebidaEm };
        m.set(r.importacaoId, { n: x.n + 1, em: x.em < r.recebidaEm ? x.em : r.recebidaEm });
      }
    return [...m.entries()];
  }, [respostas]);

  if (esg.isLoading) return <Carregando />;
  if (!esg.data) return <Falha erro={esg.error} />;
  const config = esg.data.pesquisa.config;
  const link = config ? `${window.location.origin}/pesquisa/${config.token}` : null;
  const comentarios = respostas.filter((r) => r.comentario);

  async function lerArquivo(arquivo: File) {
    if (arquivo.size > 5 * 1024 * 1024) {
      toast.error("Use um CSV de até 5 MB.");
      return;
    }
    setPrevia(importarRespostas(await arquivo.text(), evento.uf));
  }
  const baixarModelo = () => {
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff) + MODELO_CSV], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-pesquisa-de-satisfacao.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        eyebrow="ESG · Pesquisa de satisfação"
        title="Pesquisa de satisfação"
        description="Questionário padrão para o público, respondido por link público e anônimo ou importado de uma planilha."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Link público"
          hint="Quem responde não precisa de conta. Nenhum dado pessoal é pedido."
        >
          {!config ? (
            evento.podeGerir ? (
              <Button onClick={() => configurar.mutate({ aberta: true, nps: false })}>
                Criar o link da pesquisa
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                O gestor do evento ainda não criou o link.
              </p>
            )
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                  {link}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(link!).then(
                      () => toast.success("Link copiado."),
                      () => toast.error("Copie o link manualmente."),
                    )
                  }
                >
                  <Copy className="size-4" /> Copiar
                </Button>
              </div>
              <p>
                Situação: <strong>{config.aberta ? "aberta" : "fechada"}</strong> · NPS:{" "}
                <strong>{config.nps ? "incluído" : "não incluído"}</strong>
              </p>
              {evento.podeGerir && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={configurar.isPending}
                    onClick={() => configurar.mutate({ aberta: !config.aberta, nps: config.nps })}
                  >
                    {config.aberta ? "Fechar a pesquisa" : "Reabrir a pesquisa"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={configurar.isPending}
                    onClick={() => configurar.mutate({ aberta: config.aberta, nps: !config.nps })}
                  >
                    {config.nps ? "Tirar a pergunta de NPS" : "Incluir a pergunta de NPS"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={configurar.isPending}
                    onClick={() =>
                      window.confirm("Gerar um novo link? O link atual deixa de funcionar.") &&
                      configurar.mutate({ aberta: config.aberta, nps: config.nps, novoLink: true })
                    }
                  >
                    Gerar novo link
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                O NPS (recomendação de 0 a 10) só entra quando a gestão do evento pede.
              </p>
            </div>
          )}
        </Panel>

        <Panel
          title="Importar respostas"
          hint="CSV do Google Forms, Microsoft Forms ou do modelo do sistema."
        >
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={baixarModelo}>
                <Download className="size-4" /> Baixar modelo
              </Button>
              {evento.podeEditar && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <Upload className="size-4" /> Escolher CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])}
                  />
                </label>
              )}
            </div>
            {previa && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p>
                  <strong>{previa.respostas.length}</strong> resposta(s) válida(s)
                  {previa.erros.length > 0 && `, ${previa.erros.length} linha(s) com problema`}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Colunas reconhecidas: {previa.colunasReconhecidas.join(", ") || "nenhuma"}.
                  {previa.colunasIgnoradas.length > 0 &&
                    ` Ignoradas: ${previa.colunasIgnoradas.join(", ")}.`}
                </p>
                {previa.erros.slice(0, 5).map((e) => (
                  <p key={e.linha} className="text-xs text-warning-text">
                    Linha {e.linha}: {e.mensagem}
                  </p>
                ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!previa.respostas.length || importar.isPending}
                    onClick={() => importar.mutate(previa)}
                  >
                    Importar {previa.respostas.length} resposta(s)
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPrevia(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            {importacoes.map(([id, x]) => (
              <div key={id} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  Importação de {formatarDataHora(x.em)}: {x.n} resposta(s)
                </span>
                {evento.podeGerir && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      window.confirm(`Remover as ${x.n} respostas desta importação?`) &&
                      desfazer.mutate(id)
                    }
                  >
                    Desfazer
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <CartoesDeIndicadores indicadores={esg.data.indicadores.filter((i) => i.eixo === "ps")} />

      <Panel
        title="Comentários do público"
        hint="Marque os comentários que devem aparecer no relatório."
      >
        {comentarios.length === 0 ? (
          <Vazio>Nenhum comentário recebido.</Vazio>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {comentarios.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Destacar no relatório"
                  className="mt-1"
                  disabled={!evento.podeEditar || destacar.isPending}
                  checked={r.destaque}
                  onChange={(e) =>
                    destacar.mutate({ respostaId: r.id, destaque: e.target.checked })
                  }
                />
                <div className="min-w-0">
                  <p>{r.comentario}</p>
                  <p className="text-xs text-muted-foreground">
                    Nota {r.satisfacao} · {r.origem === "link" ? "link" : "importação"}
                    {r.municipioOrigem ? ` · ${nomeDoMunicipio(r.municipioOrigem)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
