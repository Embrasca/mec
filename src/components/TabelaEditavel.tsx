/**
 * Tabela de linhas editáveis, usada pelos quadros da coleta e pelo inventário.
 * As colunas calculadas vêm prontas do motor de cálculo; aqui só se exibe.
 */
import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Coluna<L> = {
  chave: keyof L & string;
  rotulo: string;
  largura?: string;
} & (
  | { tipo: "texto" }
  | { tipo: "numero" }
  | { tipo: "data" }
  | { tipo: "opcao"; opcoes: readonly string[] | ((linha: L) => readonly string[]) }
);

export interface ColunaCalculada {
  rotulo: string;
  valor: (indice: number) => ReactNode;
  alinhar?: "direita";
}

const campo =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-70";

export function TabelaEditavel<L extends Record<string, unknown>>({
  colunas,
  calculadas = [],
  linhas,
  onChange,
  novaLinha,
  somenteLeitura,
  rotuloNova = "Adicionar linha",
  maximo = 200,
  alterarLinha,
}: {
  colunas: Coluna<L>[];
  calculadas?: ColunaCalculada[];
  linhas: L[];
  onChange: (linhas: L[]) => void;
  novaLinha: () => L;
  somenteLeitura?: boolean;
  rotuloNova?: string;
  maximo?: number;
  /** Ajusta a linha depois de uma edição (ex.: limpar item ao trocar fornecedor). */
  alterarLinha?: (antes: L, depois: L) => L;
}) {
  const mudar = (i: number, chave: keyof L, valor: unknown) => {
    const antes = linhas[i]!;
    let depois = { ...antes, [chave]: valor } as L;
    if (alterarLinha) depois = alterarLinha(antes, depois);
    onChange(linhas.map((l, j) => (j === i ? depois : l)));
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 py-2 pr-2 font-medium">Nº</th>
              {colunas.map((c) => (
                <th
                  key={c.chave}
                  className="py-2 pr-2 font-medium"
                  style={c.largura ? { minWidth: c.largura } : undefined}
                >
                  {c.rotulo}
                </th>
              ))}
              {calculadas.map((c) => (
                <th
                  key={c.rotulo}
                  className={cn("py-2 pr-2 font-medium", c.alinhar === "direita" && "text-right")}
                >
                  {c.rotulo}
                </th>
              ))}
              {!somenteLeitura && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.length === 0 && (
              <tr>
                <td
                  colSpan={colunas.length + calculadas.length + 2}
                  className="py-4 text-center text-muted-foreground"
                >
                  Nenhuma linha.
                </td>
              </tr>
            )}
            {linhas.map((l, i) => (
              <tr key={i} className="align-top">
                <td className="py-1.5 pr-2 pt-3 text-xs text-muted-foreground tabular-nums">
                  {i + 1}
                </td>
                {colunas.map((c) => {
                  const v = l[c.chave];
                  const rotulo = `${c.rotulo}, linha ${i + 1}`;
                  return (
                    <td key={c.chave} className="py-1.5 pr-2">
                      {c.tipo === "opcao" ? (
                        <select
                          aria-label={rotulo}
                          disabled={somenteLeitura}
                          value={(v as string | null) ?? ""}
                          onChange={(e) => mudar(i, c.chave, e.target.value || null)}
                          className={campo}
                        >
                          <option value="">—</option>
                          {(typeof c.opcoes === "function" ? c.opcoes(l) : c.opcoes).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : c.tipo === "numero" ? (
                        <input
                          aria-label={rotulo}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={0}
                          disabled={somenteLeitura}
                          value={(v as number | null) ?? ""}
                          onChange={(e) => {
                            const t = e.target.value;
                            const n = t === "" ? null : Number(t);
                            mudar(i, c.chave, n === null || Number.isFinite(n) ? n : null);
                          }}
                          className={cn(campo, "text-right tabular-nums")}
                        />
                      ) : (
                        <input
                          aria-label={rotulo}
                          type={c.tipo === "data" ? "date" : "text"}
                          disabled={somenteLeitura}
                          maxLength={500}
                          value={(v as string | null) ?? ""}
                          onChange={(e) => mudar(i, c.chave, e.target.value || null)}
                          className={campo}
                        />
                      )}
                    </td>
                  );
                })}
                {calculadas.map((c) => (
                  <td
                    key={c.rotulo}
                    className={cn(
                      "py-1.5 pr-2 pt-3 text-sm tabular-nums",
                      c.alinhar === "direita" && "text-right",
                    )}
                  >
                    {c.valor(i)}
                  </td>
                ))}
                {!somenteLeitura && (
                  <td className="py-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover linha ${i + 1}`}
                      onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!somenteLeitura && linhas.length < maximo && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...linhas, novaLinha()])}
        >
          <Plus className="size-4" /> {rotuloNova}
        </Button>
      )}
    </div>
  );
}

/** Selo de alerta: verde para OK, âmbar para o resto. */
export function SeloAlerta({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  const ok = texto === "OK";
  return (
    <span
      className={cn(
        "inline-block rounded-md px-2 py-0.5 text-xs",
        ok ? "bg-success-soft text-success-text" : "bg-warning-soft text-warning-text",
      )}
    >
      {texto}
    </span>
  );
}
