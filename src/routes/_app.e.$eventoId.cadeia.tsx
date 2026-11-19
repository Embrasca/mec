/** Cadeia de suprimentos (CS1 a CS8): origem, porte, gasto e diligência dos fornecedores. */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Anexos,
  CartoesDeIndicadores,
  SeletorDeMunicipio,
  useAtualizarEsg,
  useEsg,
} from "@/components/esg";
import { FormularioDeCampos, type Campo } from "@/components/FormularioDeCampos";
import { Carregando, Falha, formatarData, PageHeader, Panel, Vazio } from "@/components/kit";
import { Button } from "@/components/ui/button";
import {
  DESTINOS,
  fornecedorEsgSchema,
  LIDERANCAS,
  materialSchema,
  PORTES,
  UNIDADES_DE_MATERIAL,
  type FornecedorEsg,
  type Material,
} from "@/domain/esg/esquemas";
import { nomeDoMunicipio } from "@/domain/territorio";
import { useEvento } from "@/lib/evento-atual";
import { numero } from "@/lib/formatar";
import { esgRemoverItem, esgSalvarFornecedor, esgSalvarItem } from "@/api/api.functions";

export const Route = createFileRoute("/_app/e/$eventoId/cadeia")({
  head: () => ({ meta: [{ title: "Cadeia de suprimentos" }] }),
  component: Cadeia,
});

const reais = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function camposDoFornecedor(uf: string): Campo<FornecedorEsg>[] {
  return [
    {
      chave: "municipioIbge",
      rotulo: "Município da sede",
      tipo: "livre",
      largo: true,
      render: (d, mudar) => (
        <SeletorDeMunicipio
          id="f-municipioIbge"
          valor={d.municipioIbge}
          ufInicial={uf}
          aoMudar={(municipioIbge) => mudar({ municipioIbge })}
        />
      ),
    },
    { chave: "porte", rotulo: "Porte", tipo: "opcao", opcoes: PORTES },
    { chave: "valorContratado", rotulo: "Valor contratado (R$)", tipo: "numero" },
    {
      chave: "lideranca",
      rotulo: "Negócio liderado por (autodeclarado)",
      tipo: "livre",
      largo: true,
      render: (d, mudar) => (
        <div className="flex flex-wrap gap-3 text-sm">
          {LIDERANCAS.map((l) => (
            <label key={l} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={d.lideranca.includes(l)}
                onChange={(e) =>
                  mudar({
                    lideranca: e.target.checked
                      ? [...d.lideranca, l]
                      : d.lideranca.filter((x) => x !== l),
                  })
                }
              />
              {l}
            </label>
          ))}
        </div>
      ),
    },
    {
      chave: "clausulaSocioambiental",
      rotulo: "Contrato com cláusula socioambiental",
      tipo: "simNao",
      ajuda: "Sustentabilidade, trabalho decente e entrega de dados.",
    },
    {
      chave: "consultaTrabalhoEscravo",
      rotulo: "Consulta ao Cadastro de Empregadores (trabalho escravo)",
      tipo: "data",
      ajuda: "Data da consulta à lista do Ministério do Trabalho.",
    },
    {
      chave: "consultaIbama",
      rotulo: "Consulta a embargos do IBAMA",
      tipo: "data",
    },
    {
      chave: "consultaRegularidade",
      rotulo: "Consulta à regularidade fiscal",
      tipo: "data",
    },
    {
      chave: "certificacoes",
      rotulo: "Itens com certificação",
      tipo: "texto",
      max: 500,
      ajuda: "Ex.: madeira FSC, alimentos orgânicos.",
    },
    { chave: "valorCertificado", rotulo: "Valor dos itens certificados (R$)", tipo: "numero" },
  ];
}

const CAMPOS_MATERIAL: Campo<Material>[] = [
  { chave: "material", rotulo: "Material", tipo: "texto", max: 200, largo: true },
  { chave: "quantidade", rotulo: "Quantidade", tipo: "numero" },
  {
    chave: "unidade",
    rotulo: "Unidade",
    tipo: "opcao",
    opcoes: UNIDADES_DE_MATERIAL,
    vazio: false,
  },
  { chave: "destino", rotulo: "Destino", tipo: "opcao", opcoes: DESTINOS, vazio: false },
  { chave: "receptor", rotulo: "Quem recebeu", tipo: "texto", max: 200 },
  { chave: "evidencia", rotulo: "Referência da evidência", tipo: "texto", largo: true },
];

const materialVazio = (): Material => ({
  material: "",
  quantidade: 0,
  unidade: "itens",
  destino: "Reutilizado",
  receptor: null,
  evidencia: null,
});

function Cadeia() {
  const evento = useEvento();
  const esg = useEsg();
  const atualizar = useAtualizarEsg();
  const [fornecedor, setFornecedor] = useState<{
    id: string;
    nome: string;
    dados: FornecedorEsg;
  } | null>(null);
  const [material, setMaterial] = useState<{ id: string | null; dados: Material } | null>(null);
  const remover = useMutation({
    mutationFn: (id: string) =>
      esgRemoverItem({ data: { eventoId: evento.id, lista: "material", id } }),
    onSuccess: atualizar,
    onError: (e) => toast.error(e.message),
  });
  if (esg.isLoading) return <Carregando />;
  if (!esg.data) return <Falha erro={esg.error} />;
  const { fornecedores, materiais, indicadores, area } = esg.data;

  return (
    <>
      <PageHeader
        eyebrow="ESG · Cadeia de suprimentos"
        title="Cadeia de suprimentos"
        description="Origem, porte, gasto e diligência de cada fornecedor, e o destino dos materiais depois do evento."
      />
      <p className="rounded-lg bg-info-soft p-3 text-sm text-info-text">
        Área local do evento: {area.descricao}
      </p>
      <Panel
        title="Fornecedores"
        hint={
          <>
            O cadastro dos fornecedores fica em{" "}
            <Link
              to="/e/$eventoId/fornecedores"
              params={{ eventoId: evento.id }}
              className="underline"
            >
              Fornecedores
            </Link>
            ; aqui entram os dados de cadeia de suprimentos.
          </>
        }
      >
        {fornecedores.length === 0 ? (
          <Vazio>Nenhum fornecedor cadastrado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Fornecedor</th>
                  <th className="py-2 pr-3 font-medium">Município</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor contratado</th>
                  <th className="py-2 pr-3 font-medium">Porte</th>
                  <th className="py-2 pr-3 font-medium">Diligência</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fornecedores.map((f) => {
                  const datas = [
                    f.consultaTrabalhoEscravo,
                    f.consultaIbama,
                    f.consultaRegularidade,
                  ];
                  const feitas = datas.filter(Boolean).length;
                  return (
                    <tr key={f.id}>
                      <td className="py-2 pr-3 font-medium">
                        {f.nome}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {f.tipo}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{nomeDoMunicipio(f.municipioIbge) ?? "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {reais(f.valorContratado)}
                      </td>
                      <td className="py-2 pr-3">{f.porte ?? "—"}</td>
                      <td className="py-2 pr-3 text-xs">
                        {feitas === 3
                          ? `Completa (${formatarData(
                              datas.filter((x): x is string => Boolean(x)).sort()[0]!,
                            )})`
                          : `${feitas} de 3 consultas`}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const { id, nome, tipo: _t, ...dados } = f;
                            setFornecedor({ id, nome, dados });
                          }}
                        >
                          {evento.podeEditar ? "Dados ESG" : "Ver"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Destino dos materiais depois do evento"
        actions={
          evento.podeEditar && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMaterial({ id: null, dados: materialVazio() })}
            >
              <Plus className="size-4" /> Material
            </Button>
          )
        }
      >
        {materiais.length === 0 ? (
          <Vazio>Nenhum material registrado.</Vazio>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {materiais.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 font-medium">{m.material}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {numero(m.quantidade)} {m.unidade}
                  </td>
                  <td className="py-2 pr-3">{m.destino}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.receptor ?? ""}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const { id, ...dados } = m;
                        setMaterial({ id, dados });
                      }}
                    >
                      {evento.podeEditar ? "Editar" : "Ver"}
                    </Button>
                    {evento.podeEditar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          window.confirm(`Remover “${m.material}”?`) && remover.mutate(m.id)
                        }
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

      <CartoesDeIndicadores indicadores={indicadores.filter((i) => i.eixo === "cs")} />

      {fornecedor && (
        <FormularioDeCampos<FornecedorEsg>
          titulo={`Dados ESG · ${fornecedor.nome}`}
          campos={camposDoFornecedor(evento.uf)}
          inicial={fornecedor.dados}
          schema={fornecedorEsgSchema}
          somenteLeitura={!evento.podeEditar}
          fechar={() => setFornecedor(null)}
          salvar={async (dados) => {
            await esgSalvarFornecedor({
              data: { eventoId: evento.id, fornecedorId: fornecedor.id, dados },
            });
            await atualizar();
            toast.success("Dados do fornecedor salvos.");
          }}
          rodape={<Anexos entidade="fornecedor" entidadeId={fornecedor.id} />}
        />
      )}
      {material && (
        <FormularioDeCampos<Material>
          titulo={material.id ? "Material" : "Novo material"}
          campos={CAMPOS_MATERIAL}
          inicial={material.dados}
          schema={materialSchema}
          somenteLeitura={!evento.podeEditar}
          fechar={() => setMaterial(null)}
          salvar={async (dados) => {
            await esgSalvarItem({
              data: { eventoId: evento.id, lista: "material", id: material.id, dados },
            });
            await atualizar();
            toast.success("Material salvo.");
          }}
          rodape={material.id ? <Anexos entidade="material" entidadeId={material.id} /> : undefined}
        />
      )}
    </>
  );
}
