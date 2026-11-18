import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Shell } from "@/components/Shell";
import { Carregando, Falha, formatarDataHora, PageHeader, Panel } from "@/components/kit";
import { auditoriaListar } from "@/api/api.functions";

export const Route = createFileRoute("/_app/admin/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria" }] }),
  component: Auditoria,
});

const ACOES: Record<string, string> = {
  registrar_conta: "Registrou conta",
  alterar_usuario: "Alterou usuário",
  criar_evento: "Criou evento",
  alterar_evento: "Alterou cadastro do evento",
  arquivar_evento: "Arquivou evento",
  reabrir_evento: "Reabriu evento",
  definir_membro: "Definiu papel na equipe",
  remover_membro: "Removeu da equipe",
  salvar_caracterizacao: "Salvou a caracterização",
  confirmar_enquadramento: "Confirmou o enquadramento",
  reenquadrar: "Registrou reenquadramento",
  marcar_requisito: "Marcou requisito do nível",
};

function Auditoria() {
  const lista = useQuery({
    queryKey: ["auditoria"],
    queryFn: () => auditoriaListar({ data: { eventoId: null } }),
  });
  return (
    <Shell>
      <PageHeader
        eyebrow="Administração"
        title="Auditoria"
        description="Últimas 200 ações registradas. A trilha só recebe inclusões: não pode ser alterada nem apagada."
      />
      <Panel>
        {lista.isLoading && <Carregando />}
        {lista.error && <Falha erro={lista.error} />}
        {lista.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Quando</th>
                  <th className="py-2 pr-3 font-medium">Quem</th>
                  <th className="py-2 pr-3 font-medium">Ação</th>
                  <th className="py-2 pr-3 font-medium">Evento</th>
                  <th className="py-2 font-medium">Item</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista.data.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatarDataHora(l.em)}</td>
                    <td className="py-2 pr-3">{l.usuario ?? "—"}</td>
                    <td className="py-2 pr-3">{ACOES[l.acao] ?? l.acao}</td>
                    <td className="py-2 pr-3">{l.evento ?? "—"}</td>
                    <td className="py-2 text-xs text-muted-foreground">{l.entidadeId ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Shell>
  );
}
