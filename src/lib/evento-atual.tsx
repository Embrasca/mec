import { createContext, useContext } from "react";
import type { EventoResumo } from "@/servidor/servicos/eventos.server";

export const EventoAtual = createContext<EventoResumo | null>(null);

export function useEvento(): EventoResumo {
  const e = useContext(EventoAtual);
  if (!e) throw new Error("useEvento precisa estar dentro da área de um evento.");
  return e;
}
