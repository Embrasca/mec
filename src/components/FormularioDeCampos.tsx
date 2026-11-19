/** Formulário em janela montado a partir de uma lista de campos (telas ESG). */
import { useState, type FormEvent, type ReactNode } from "react";
import type { ZodType } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type Campo<T> = {
  chave: keyof T & string;
  rotulo: string;
  ajuda?: string;
  largo?: boolean;
} & (
  | { tipo: "texto"; max?: number }
  | { tipo: "inteiro" | "numero" }
  | { tipo: "data" }
  | { tipo: "opcao"; opcoes: readonly string[]; vazio?: boolean }
  | { tipo: "simNao" }
  | { tipo: "livre"; render: (valor: T, mudar: (v: Partial<T>) => void) => ReactNode }
);

const sel = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

export function FormularioDeCampos<T extends Record<string, unknown>>({
  titulo,
  campos,
  inicial,
  schema,
  salvar,
  fechar,
  rodape,
  somenteLeitura,
}: {
  titulo: string;
  campos: Campo<T>[];
  inicial: T;
  schema: ZodType<unknown>;
  salvar: (dados: T) => Promise<unknown>;
  fechar: () => void;
  /** Conteúdo abaixo do formulário (ex.: anexos de um item já salvo). */
  rodape?: ReactNode;
  somenteLeitura?: boolean;
}) {
  const [d, setD] = useState<T>(inicial);
  const [enviando, setEnviando] = useState(false);
  const mudar = (v: Partial<T>) => setD((x) => ({ ...x, ...v }));
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const r = schema.safeParse(d);
    if (!r.success) {
      const i = r.error.issues[0];
      const campo = campos.find((c) => c.chave === i?.path[0]);
      toast.error(`${campo ? `${campo.rotulo}: ` : ""}${i?.message ?? "Revise os campos."}`);
      return;
    }
    setEnviando(true);
    try {
      await salvar(r.data as T);
      fechar();
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    } finally {
      setEnviando(false);
    }
  }
  const numero = (v: string, inteiro: boolean) => {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? (inteiro ? Math.trunc(n) : n) : null;
  };
  return (
    <Dialog open onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
          <fieldset disabled={somenteLeitura || enviando} className="contents">
            {campos.map((c) => {
              const id = `f-${c.chave}`;
              const v = d[c.chave];
              let controle: ReactNode;
              if (c.tipo === "livre") controle = c.render(d, mudar);
              else if (c.tipo === "opcao")
                controle = (
                  <select
                    id={id}
                    className={sel}
                    value={(v as string | null) ?? ""}
                    onChange={(e) => mudar({ [c.chave]: e.target.value || null } as Partial<T>)}
                  >
                    {c.vazio !== false && <option value="">—</option>}
                    {c.opcoes.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                );
              else if (c.tipo === "simNao")
                controle = (
                  <select
                    id={id}
                    className={sel}
                    value={v === true ? "Sim" : v === false ? "Não" : ""}
                    onChange={(e) =>
                      mudar({
                        [c.chave]: e.target.value === "" ? null : e.target.value === "Sim",
                      } as Partial<T>)
                    }
                  >
                    <option value="">—</option>
                    <option>Sim</option>
                    <option>Não</option>
                  </select>
                );
              else
                controle = (
                  <Input
                    id={id}
                    type={c.tipo === "data" ? "date" : c.tipo === "texto" ? "text" : "number"}
                    step={c.tipo === "inteiro" ? 1 : c.tipo === "numero" ? "any" : undefined}
                    min={c.tipo === "inteiro" || c.tipo === "numero" ? 0 : undefined}
                    maxLength={c.tipo === "texto" ? (c.max ?? 1000) : undefined}
                    value={(v as string | number | null) ?? ""}
                    onChange={(e) =>
                      mudar({
                        [c.chave]:
                          c.tipo === "inteiro" || c.tipo === "numero"
                            ? numero(e.target.value, c.tipo === "inteiro")
                            : e.target.value || null,
                      } as Partial<T>)
                    }
                  />
                );
              return (
                <div key={c.chave} className={cn("space-y-1.5", c.largo && "sm:col-span-2")}>
                  <Label htmlFor={id}>{c.rotulo}</Label>
                  {controle}
                  {c.ajuda && <p className="text-xs text-muted-foreground">{c.ajuda}</p>}
                </div>
              );
            })}
          </fieldset>
          {rodape && <div className="sm:col-span-2">{rodape}</div>}
          {!somenteLeitura && (
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" disabled={enviando}>
                {enviando ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
