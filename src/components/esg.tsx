/** Peças das telas ESG: dados do evento, anexos de evidência e seletor de município. */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { IndicadorCalculado, SituacaoEsg } from "@/domain/esg/indicadores";
import { UFS } from "@/domain/evento";
import { municipio, municipiosDaUf } from "@/domain/territorio";
import { useEvento } from "@/lib/evento-atual";
import { cn } from "@/lib/utils";
import { anexoBaixar, anexoEnviar, anexoRemover, esgObter } from "@/api/api.functions";

export function useEsg() {
  const evento = useEvento();
  return useQuery({
    queryKey: ["esg", evento.id],
    queryFn: () => esgObter({ data: { eventoId: evento.id } }),
  });
}

export function useAtualizarEsg() {
  const evento = useEvento();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["esg", evento.id] });
}

const TOM: Record<SituacaoEsg, string> = {
  ok: "bg-success-soft text-success-text",
  pendente: "bg-warning-soft text-warning-text",
  nao_se_aplica: "bg-muted text-muted-foreground",
  sem_dados: "bg-muted text-muted-foreground",
};
const NOME: Record<SituacaoEsg, string> = {
  ok: "Calculado",
  pendente: "Pendente",
  nao_se_aplica: "Não se aplica",
  sem_dados: "Sem dados",
};

export function SeloEsg({ situacao }: { situacao: SituacaoEsg }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TOM[situacao],
      )}
    >
      {NOME[situacao]}
    </span>
  );
}

/** Cartões dos indicadores de um eixo, com valor, situação e detalhes. */
export function CartoesDeIndicadores({ indicadores }: { indicadores: IndicadorCalculado[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {indicadores.map((i) => (
        <div key={i.id} className="panel space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">
              <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i.id}</span>
              {i.nome}
              {i.essencial && (
                <span className="ml-1.5 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info-text">
                  ESSENCIAL
                </span>
              )}
            </p>
            <SeloEsg situacao={i.situacao} />
          </div>
          <p className="text-lg font-semibold tabular-nums">{i.valor ?? "—"}</p>
          {i.justificativa && (
            <p className="text-xs text-muted-foreground">Não se aplica: {i.justificativa}</p>
          )}
          {i.detalhes.length > 0 && (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-xs">
              {i.detalhes.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {i.pendencias.length > 0 && (
            <ul className="space-y-0.5 text-xs text-warning-text">
              {i.pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {i.gri && <p className="text-[11px] text-muted-foreground">{i.gri}</p>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------

const ACEITOS: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const LIMITE = 3 * 1024 * 1024;

/** Foto grande demais vira JPEG menor no próprio navegador antes de enviar. */
async function reduzirImagem(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  for (const lado of [2400, 1800, 1400, 1000]) {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob && blob.size <= LIMITE) return blob;
  }
  throw new Error("A imagem continua acima de 3 MB mesmo reduzida.");
}

const paraBase64 = (b: Blob) =>
  new Promise<string>((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => erro(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(b);
  });

export function Anexos({
  entidade,
  entidadeId,
}: {
  entidade: "equipe" | "fornecedor" | "material" | "acao_social" | "registro_esg" | "pesquisa";
  entidadeId: string;
}) {
  const evento = useEvento();
  const esg = useEsg();
  const atualizar = useAtualizarEsg();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const lista = (esg.data?.anexos ?? []).filter(
    (a) => a.entidade === entidade && a.entidadeId === entidadeId,
  );
  const remover = useMutation({
    mutationFn: (id: string) => anexoRemover({ data: { eventoId: evento.id, id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });

  async function enviar(arquivo: File) {
    const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
    let tipo = ACEITOS[ext];
    if (!tipo) {
      toast.error("Use PDF, imagem (JPG, PNG, WEBP), CSV, XLSX ou DOCX.");
      return;
    }
    setEnviando(true);
    try {
      let conteudo: Blob = arquivo;
      let nome = arquivo.name;
      if (arquivo.size > LIMITE) {
        if (!tipo.startsWith("image/")) throw new Error("O arquivo passa de 3 MB.");
        conteudo = await reduzirImagem(arquivo);
        tipo = "image/jpeg";
        nome = nome.replace(/\.[^.]+$/, "") + ".jpg";
      }
      await anexoEnviar({
        data: {
          eventoId: evento.id,
          entidade,
          entidadeId,
          nome,
          tipo: tipo as never,
          base64: await paraBase64(conteudo),
        },
      });
      await atualizar();
      toast.success("Anexo enviado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o anexo.");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function baixar(id: string) {
    try {
      const a = await anexoBaixar({ data: { eventoId: evento.id, id } });
      const bytes = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: a.tipo }));
      const link = document.createElement("a");
      link.href = url;
      link.download = a.nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível baixar o anexo.");
    }
  }

  return (
    <div className="space-y-1.5">
      {lista.map((a) => (
        <div key={a.id} className="flex items-center gap-2 text-xs">
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
          <button type="button" className="truncate underline" onClick={() => baixar(a.id)}>
            {a.nome}
          </button>
          <span className="shrink-0 text-muted-foreground">{(a.tamanho / 1024).toFixed(0)} KB</span>
          <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {evento.podeEditar && (
            <button
              type="button"
              aria-label={`Remover ${a.nome}`}
              className="ml-auto text-muted-foreground hover:text-danger-text"
              onClick={() => window.confirm(`Remover ${a.nome}?`) && remover.mutate(a.id)}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      {evento.podeEditar && (
        <>
          <input
            ref={entrada}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xlsx,.docx"
            onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={enviando}
            onClick={() => entrada.current?.click()}
          >
            <Paperclip className="size-4" /> {enviando ? "Enviando…" : "Anexar evidência"}
          </Button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Seletor de município (UF + município, lista do IBGE)
// ---------------------------------------------------------------------

export function SeletorDeMunicipio({
  id,
  valor,
  ufInicial,
  aoMudar,
}: {
  id: string;
  valor: number | null;
  ufInicial: string;
  aoMudar: (municipioIbge: number | null) => void;
}) {
  const [uf, setUf] = useState(municipio(valor)?.uf ?? ufInicial);
  const sel = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";
  return (
    <div className="flex gap-2">
      <select
        aria-label="UF"
        className={cn(sel, "w-20")}
        value={uf}
        onChange={(e) => {
          setUf(e.target.value);
          aoMudar(null);
        }}
      >
        {UFS.map((u) => (
          <option key={u}>{u}</option>
        ))}
      </select>
      <select
        id={id}
        className={cn(sel, "min-w-0 flex-1")}
        value={valor ?? ""}
        onChange={(e) => aoMudar(Number(e.target.value) || null)}
      >
        <option value="">Escolha o município</option>
        {municipiosDaUf(uf).map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
