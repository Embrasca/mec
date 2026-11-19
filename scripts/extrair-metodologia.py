"""Extrai da Ferramenta MEC/GIZ v3.16 (.xlsx) os textos da metodologia e os
casos de referência usados nos testes do motor de nível.

Uso:  python3 -I scripts/extrair-metodologia.py <ferramenta.xlsx> [<outra.xlsx> ...]

Gera:
  src/domain/metodologia/v3_16/textos.json        (listas, requisitos, roteiro)
  src/domain/metodologia/v3_16/inventario.json    (base de fatores, fornecedores, listas)
  src/domain/metodologia/v3_16/checklist.json     (listas de verificação por fase e nível)
  src/domain/metodologia/__tests__/fixtures/*.json (entradas e resultados de referência)

A planilha é a fonte da verdade: este script só copia, não interpreta.
"""
import json, sys, os, re, datetime
import openpyxl

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = "A - CARACTERIZAÇÃO"


def val(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str):
        return v.strip()
    return v


def textos(caminho):
    wb = openpyxl.load_workbook(caminho)
    L = wb["LISTAS"]
    col = lambda c, r0, r1: [val(L[f"{c}{r}"].value) for r in range(r0, r1 + 1) if L[f"{c}{r}"].value is not None]
    a = wb[A]
    criterios = []
    for i, r in enumerate(range(65, 75)):
        c = "ABCDEFGHIJ"[i]
        criterios.append({
            "rotulo": val(a[f"B{r}"].value),
            "opcoes": col(c, 11, 14),
            "tresPontos": val(a[f"E{r}"].value),
        })
    b = wb["B - ACOMPANHAMENTO"]
    requisitos, fase = [], None
    for r in range(6, 28):
        rot = val(b[f"B{r}"].value)
        if rot is None:
            continue
        niveis = [val(b[f"{c}{r}"].value) for c in "CDEF"]
        if all(n is None for n in niveis):
            fase = rot
            continue
        requisitos.append({"fase": fase, "requisito": rot, "porNivel": niveis})
    ini = wb["INÍCIO"]
    roteiro = [{"fase": val(ini[f"B{r}"].value), "aba": val(ini[f"C{r}"].value),
                "oQueFazer": val(ini[f"D{r}"].value), "noGuia": val(ini[f"E{r}"].value)}
               for r in range(9, 25) if ini[f"B{r}"].value]
    mudancas = [{"seAcontecer": val(a[f"B{r}"].value), "nivelMinimo": val(a[f"C{r}"].value)}
                for r in range(113, 122)]
    gatilhos = [{"condicao": val(a[f"B{r}"].value), "elevaAte": val(a[f"E{r}"].value)} for r in range(80, 92)]
    ajuda = {f"C{r}": val(a[f"D{r}"].value) for r in range(5, 50) if a[f"D{r}"].value}
    return {
        "fonte": val(ini["B1"].value),
        "versao": "3.16",
        "formatos": col("A", 4, 6),
        "simNao": col("B", 4, 5),
        "alegacoes": col("H", 4, 7),
        "logistica": col("I", 11, 14),
        "criteriosComplexidade": criterios,
        "faixasComplexidade": val(a["E76"].value),
        "gatilhos": gatilhos,
        "notaGatilhos": val(a["B95"].value),
        "requisitos": requisitos,
        "roteiro": roteiro,
        "niveis": [val(ini[f"C{r}"].value) for r in range(37, 41)],
        "oQueMudaria": mudancas,
        "notaSoSobe": val(a["B122"].value),
        "notaImpacto": val(a["B53"].value),
        "notaInternacional": val(a["B50"].value),
        "notaParticipantes": val(a["B43"].value),
        "ajudaCampos": ajuda,
    }


ENTRADAS = {
    "nome": "C5", "instituicao": "C6", "ano": "C7", "cidadeUf": "C8", "dataInicio": "C9", "dataFim": "C10",
    "responsavel": "C11", "formato": "C14", "participantesDia": "C15", "participantesTotal": "C17",
    "percentualAereo": "C18", "diariasHospedagem": "C19", "fornecedores": "C20", "areaEstruturaM2": "C21",
    "potenciaGeradoresKva": "C22", "numeroGeradores": "C23", "locaisSimultaneos": "C24",
    "transporteAquaviario": "C26", "itinerante": "C27", "porcoesAlimentacao": "C28", "residuosKg": "C29",
    "alegacao": "C30", "pctOnibus": "C33", "pctCarro": "C34", "pctTrem": "C35", "pctLocal": "C36",
    "pctOutros": "C37", "participantesDiaSoma": "C41", "acessosCredenciamento": "C42",
    "internacionaisPresenciais": "C46", "internacionaisOnline": "C47", "vooInternacional": "C48",
    "logistica": "C49", "elevacaoTecnica": "C97", "justificativaElevacao": "C98",
}
COMPLEXIDADE = [f"C{r}" for r in range(65, 75)]
SAIDAS = {
    "dias": "C16", "haInternacionais": "C25", "totalModal": "C38", "conferenciaModal": "B39",
    "etapa1": "C61", "pontos": [f"D{r}" for r in range(65, 75)], "totalPontos": "D75", "etapa2": "D76",
    "gatilhos": [f"D{r}" for r in range(80, 92)], "gatilhosAcionados": "D93", "etapa3": "D94",
    "conferenciaElevacao": "C99", "definiu": [f"D{r}" for r in range(103, 107)], "nivelFinal": "C108",
    "designacao": "D108", "determinante": "C109", "jaE": [f"D{r}" for r in range(113, 122)],
}


def caso(caminho):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    a = wb[A]
    g = lambda ref: val(a[ref].value)
    entradas = {k: g(ref) for k, ref in ENTRADAS.items()}
    entradas["complexidade"] = [g(ref) for ref in COMPLEXIDADE]
    esperado = {k: ([g(x) for x in ref] if isinstance(ref, list) else g(ref)) for k, ref in SAIDAS.items()}
    b = wb["B - ACOMPANHAMENTO"]
    esperado["requisitosDoNivel"] = [val(b[f"G{r}"].value) for r in range(6, 28)
                                    if b[f"C{r}"].value is not None]
    return {"arquivo": os.path.basename(caminho), "entradas": entradas, "esperado": esperado}


# ---------------------------------------------------------------------------
# Etapa 2: base de fatores, fornecedores, listas e casos do inventário/coleta
# ---------------------------------------------------------------------------

def inventario(caminho):
    wb = openpyxl.load_workbook(caminho)
    wv = openpyxl.load_workbook(caminho, data_only=True)
    f, fv = wb["FATORES"], wv["FATORES"]
    sin = [{"ano": val(f[f"N{r}"].value), "valor": val(f[f"O{r}"].value)}
           for r in range(6, 26) if f[f"N{r}"].value is not None]
    itens = []
    for r in range(11, 55):
        if f[f"C{r}"].value is None:
            continue
        bruto = f[f"G{r}"].value
        texto = bruto.text if hasattr(bruto, "text") else bruto
        if isinstance(texto, str) and texto.startswith("="):
            m = re.search(r"([0-9.]+)\*\$B\$8", texto)
            regra = {"tipo": "sin", "multiplicador": float(m.group(1)) if m else 1.0}
        else:
            regra = {"tipo": "fixo"}
        itens.append({
            "codigo": val(f[f"A{r}"].value), "categoria": val(f[f"B{r}"].value), "item": val(f[f"C{r}"].value),
            "unidade": val(f[f"D{r}"].value), "escopo": int(f[f"E{r}"].value),
            "feCo2": None if regra["tipo"] == "sin" else (fv[f"G{r}"].value or 0),
            "feCh4": fv[f"H{r}"].value or 0, "feN2o": fv[f"I{r}"].value or 0, "feBiogenico": fv[f"J{r}"].value or 0,
            "regra": regra, "fonte": val(f[f"K{r}"].value), "situacao": val(f[f"L{r}"].value),
        })
    L = wb["LISTAS ITENS"]
    porFornecedor = {}
    for r in range(60, 71):
        tipo = val(L[f"A{r}"].value)
        porFornecedor[tipo] = [val(c.value) for c in L[r][1:] if c.value is not None]
    lc = wb["LISTAS CALCULO"]
    descricoes = {}
    for col in "FGHIJKLMNO":
        cat = val(lc[f"{col}3"].value)
        descricoes[cat] = [val(lc[f"{col}{r}"].value) for r in range(4, 13) if lc[f"{col}{r}"].value]
    fo = wb["FORNECEDORES"]
    tipos = [{"tipo": val(fo[f"B{r}"].value), "oQuePedir": val(fo[f"C{r}"].value),
              "unidade": val(fo[f"D{r}"].value), "comprovante": val(fo[f"E{r}"].value)} for r in range(8, 18)]
    return {
        "baseDeFatores": {
            "nome": "GHG Protocol Brasil 2026.0.1",
            "fonte": val(f["A2"].value),
            "gwpCh4": fv["B5"].value, "gwpN2o": fv["B6"].value, "referenciaGwp": val(f["C5"].value),
            "sin": sin, "itens": itens,
            "notas": [val(f[f"A{r}"].value) for r in (55, 57, 59, 61, 63)],
        },
        "itensPorFornecedor": porFornecedor,
        "descricoesPorCategoria": descricoes,
        "fornecedores": {
            "tipos": tipos,
            "entregaPorNivel": [val(fo[f"P{r}"].value) for r in range(6, 10)],
            "notaPrazo": val(fo["B19"].value),
        },
        "qualidade": [val(lc[f"A{r}"].value) for r in range(4, 10)],
    }


def linhas_inventario(ws, wv, com_qualidade):
    out = []
    for r in range(5, 50):
        if ws[f"B{r}"].value is None:
            continue
        g = lambda c: val(wv[f"{c}{r}"].value)
        linha = {"fornecedor": g("A"), "item": g("B"), "descricao": g("C"), "quantidade": g("D"),
                 "premissa": g("R" if com_qualidade else "P"),
                 "esperado": {"unidade": g("E"), "categoria": g("F"), "escopo": g("G"),
                              "tco2eCo2": g("K"), "tco2eCh4": g("L"), "tco2eN2o": g("M"), "total": g("N"),
                              "biogenico": g("O"), "alerta": g("S" if com_qualidade else "Q")}}
        if com_qualidade:
            linha["qualidade"] = g("P")
            linha["evidencia"] = g("Q")
        out.append(linha)
    totais = {"co2": val(wv["K51"].value), "ch4": val(wv["L51"].value), "n2o": val(wv["M51"].value),
              "total": val(wv["N51"].value), "biogenico": val(wv["O51"].value),
              "porCategoria": {val(wv[f"B{r}"].value): val(wv[f"C{r}"].value) for r in range(54, 64)},
              "porEscopo": [val(wv[f"C{r}"].value) for r in range(66, 69)]}
    return {"linhas": out, "totais": totais, "mensagemNivel": val(wv["A3"].value)}


def coleta(wv):
    c = wv["COLETA"]
    g = lambda ref: val(c[ref].value)
    linhas = lambda r0, r1, cols: [{k: g(f"{col}{r}") for k, col in cols.items()} for r in range(r0, r1 + 1)]
    return {
        "q1": {"leituras": linhas(43, 54, {"data": "C", "momento": "D", "leitura": "E", "documento": "G"}),
               "parcela": g("C56"), "criterio": g("E56"),
               "outras": linhas(60, 65, {"origem": "C", "funcao": "D", "kwh": "E", "comprovante": "F"})},
        "q2": linhas(70, 75, {"identificacao": "C", "funcao": "D", "kva": "E", "combustivel": "F", "abastecido": "G",
                              "horas": "H", "consumoHora": "I", "premissa": "L"}),
        "q3": linhas(80, 91, {"tipo": "C", "servico": "D", "pessoas": "E", "porcoes": "F", "quilos": "G",
                              "pesoPorcao": "H", "premissa": "K"}),
        "q4": linhas(96, 105, {"destino": "C", "tipo": "D", "quilos": "E", "recipientes": "F", "volume": "G",
                               "cheio": "H", "densidade": "I", "responsavel": "L", "documento": "M"}),
        "q5": {"houveRecarga": g("F109"),
               "linhas": linhas(112, 116, {"fluido": "C", "quilos": "D", "equipamento": "E", "ordemServico": "F"})},
        "q6": linhas(121, 130, {"material": "C", "quilos": "D", "condicao": "E", "origem": "F", "destinacao": "G",
                                "comprovante": "I"}),
        "q7": linhas(135, 154, {"municipio": "C", "uf": "D", "pessoas": "E", "meio": "F", "distancia": "G",
                                "trechos": "H", "aeroporto": "I", "complementar": "J", "distanciaComplementar": "K",
                                "pessoasPorCarro": "L", "kmPorLitro": "M"}),
        "q8hoteis": linhas(159, 166, {"hotel": "C", "municipio": "D", "hospedes": "E", "diarias": "F",
                                      "distancia": "G", "comprovante": "H"}),
        "q8transporte": linhas(169, 176, {"servico": "C", "rota": "D", "distancia": "E", "viagens": "F",
                                          "passageiros": "G", "litros": "H", "kmPorLitro": "I"}),
        "esperado": {
            "resumo": {g(f"B{r}"): g(f"E{r}") for r in range(6, 37)},
            "q1": {"medido": g("C55"), "atribuido": g("C57")},
            "q2": [{"origem": g(f"J{r}"), "considerada": g(f"K{r}"), "alerta": g(f"M{r}")} for r in range(70, 76)],
            "q3": [{"consideradas": g(f"I{r}"), "origem": g(f"J{r}")} for r in range(80, 92)],
            "q4": [{"considerados": g(f"J{r}"), "forma": g(f"K{r}")} for r in range(96, 106)],
            "q6": [g(f"H{r}") for r in range(121, 131)],
            "q7": [{"faixa": g(f"N{r}"), "aviao": g(f"O{r}"), "onibus": g(f"P{r}"), "carro": g(f"Q{r}"),
                    "conferencia": g(f"R{r}")} for r in range(135, 155)],
            "q8transporte": [{"passageiroKm": g(f"J{r}"), "litros": g(f"K{r}")} for r in range(169, 177)],
        },
    }


# ---------------------------------------------------------------------------
# Etapa 3: checklist (aba C / BASE LISTAS) e plano de redução (aba REDUÇÃO)
# ---------------------------------------------------------------------------

FASES_CHECKLIST = {"A": (7, 61), "B": (67, 118), "C": (124, 186)}


def base_checklist(caminho):
    wb = openpyxl.load_workbook(caminho)
    ws = wb["BASE LISTAS"]
    itens = []
    for r in range(4, 174):
        if ws[f"A{r}"].value is None:
            continue
        itens.append({"fase": val(ws[f"A{r}"].value), "nivel": val(ws[f"B{r}"].value),
                      "ordem": val(ws[f"C{r}"].value), "oQueFazer": val(ws[f"D{r}"].value),
                      "quando": val(ws[f"E{r}"].value), "quemFaz": val(ws[f"F{r}"].value),
                      "registro": val(ws[f"G{r}"].value)})
    return itens


def caso_checklist(caminho):
    wv = openpyxl.load_workbook(caminho, data_only=True)
    c = wv["C - CHECKLIST"]
    fases = {}
    for fase, (r0, r1) in FASES_CHECKLIST.items():
        fases[fase] = {
            "visiveis": [val(c[f"B{r}"].value) for r in range(r0, r1 + 1) if c[f"C{r}"].value],
            "novos": [val(c[f"B{r}"].value) for r in range(r0, r1 + 1) if c[f"I{r}"].value == "NOVO"],
            "feitos": {str(val(c[f"B{r}"].value)): val(c[f"G{r}"].value)
                       for r in range(r0, r1 + 1) if c[f"C{r}"].value},
            "progresso": val(c[f"G{r1 + 1}"].value),
            "situacao": val(c[f"H{r1 + 1}"].value),
        }
    return {"nivel": val(wv["A - CARACTERIZAÇÃO"]["C108"].value), "fases": fases}


def caso_reducao(caminho):
    wv = openpyxl.load_workbook(caminho, data_only=True)
    r = wv["REDUÇÃO"]
    g = lambda ref: val(r[ref].value)
    medidas = []
    for i in range(8, 38):
        if r[f"C{i}"].value is None and r[f"E{i}"].value is None:
            continue
        medidas.append({
            "categoria": g(f"C{i}"), "acao": g(f"E{i}"), "objetivo": g(f"F{i}"), "metaPct": g(f"G{i}"),
            "responsavel": g(f"I{i}"), "prazo": g(f"J{i}"), "resultado": g(f"K{i}"), "evidencia": g(f"N{i}"),
            "esperado": {"exAnte": g(f"D{i}"), "metaT": g(f"H{i}"), "exPost": g(f"L{i}"), "diferenca": g(f"M{i}")},
        })
    return {"nivel": g("D4"), "medidas": medidas,
            "esperado": {"registradas": g("F4"), "completas": g("G4"), "exigencia": g("I4"), "conferencia": g("B5")}}


def caso_pos_evento(caminho):
    """Abas 4 - RESULTADOS, 5 - COMPARAÇÃO, 6 - EMISSÕES RESIDUAIS e OCORRÊNCIAS."""
    wv = openpyxl.load_workbook(caminho, data_only=True)
    r, c, e, o = wv["4 - RESULTADOS"], wv["5 - COMPARAÇÃO"], wv["6 - EMISSÕES RESIDUAIS"], wv["OCORRÊNCIAS"]
    a = wv["A - CARACTERIZAÇÃO"]
    g = lambda ws, ref: val(ws[ref].value)
    return {
        "participantes": g(a, "C17"), "participantesDia": g(a, "C15"), "dias": g(a, "C16"),
        "participantesDiaSoma": g(a, "C41"), "nivel": g(a, "C108"),
        "resultados": {
            "principais": {k: g(r, ref) for k, ref in
                           [("total", "C5"), ("exAnte", "C6"), ("variacao", "C7"), ("biogenico", "C8"),
                            ("porParticipante", "C9"), ("porParticipanteDia", "C10")]},
            "categorias": [{"categoria": g(r, f"B{i}"), "exAnte": g(r, f"C{i}"), "exPost": g(r, f"D{i}"),
                            "participacao": g(r, f"E{i}"), "variacao": g(r, f"F{i}"), "material": g(r, f"G{i}")}
                           for i in range(14, 24)],
            "escoposEGases": [[g(r, f"C{i}"), g(r, f"D{i}")] for i in range(29, 35)],
            "qualidade": {"linhas": g(r, "C38"), "pendentes": g(r, "C39"), "primario": g(r, "C40"),
                          "minimoPrimario": g(r, "D40"), "situacaoPrimario": g(r, "E40"),
                          "notaMedia": g(r, "C41"), "estimadas": g(r, "C42"), "fontes5": g(r, "C43"),
                          "minimoFontes5": g(r, "D43"), "situacaoFontes5": g(r, "E43")},
            "completude": [{"categoria": g(r, f"B{i}"), "linhas": g(r, f"C{i}"), "alertas": g(r, f"D{i}"),
                            "semEvidencia": g(r, f"E{i}"), "situacao": g(r, f"G{i}")} for i in range(51, 61)],
        },
        "comparacao": {
            "categorias": [{"categoria": g(c, f"B{i}"), "exAnte": g(c, f"C{i}"), "exPost": g(c, f"D{i}"),
                            "diferenca": g(c, f"E{i}"), "pct": g(c, f"F{i}"), "origem": g(c, f"G{i}"),
                            "explicacao": g(c, f"H{i}")} for i in range(5, 15)],
            "total": [g(c, f"{col}16") for col in "CDEF"],
        },
        "relatorio": {"frase": g(wv["7 - RELATÓRIO"], "B25"),
                      "valores": {g(wv["7 - RELATÓRIO"], f"B{i}"): g(wv["7 - RELATÓRIO"], f"C{i}") for i in range(4, 23)}},
        "residuais": {k: g(e, ref) for k, ref in
                      [("brutas", "C5"), ("residuais", "C7"), ("omissao", "C8"), ("aCompensar", "C9"),
                       ("aposentada", "C10"), ("saldo", "C11"), ("completa", "C13")]},
        "ocorrencias": {
            "registradas": g(o, "D4"), "abertas": g(o, "F4"), "alerta": g(o, "G4"),
            "linhas": [{"data": str(o[f"C{i}"].value.date()) if o[f"C{i}"].value else None,
                        "fase": g(o, f"D{i}"), "categoria": g(o, f"E{i}"), "ocorrencia": g(o, f"F{i}"),
                        "impacto": g(o, f"G{i}"), "acao": g(o, f"H{i}"), "responsavel": g(o, f"I{i}"),
                        "situacao": g(o, f"J{i}"), "premissa": g(o, f"K{i}")}
                       for i in range(6, 66) if o[f"F{i}"].value],
        },
    }


def main(arquivos):
    t = textos(arquivos[0])
    destino = os.path.join(RAIZ, "src/domain/metodologia/v3_16/textos.json")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    json.dump(t, open(destino, "w"), ensure_ascii=False, indent=2)
    json.dump(inventario(arquivos[0]), open(destino.replace("textos.json", "inventario.json"), "w"),
              ensure_ascii=False, indent=2)
    fixtures = os.path.join(RAIZ, "src/domain/metodologia/__tests__/fixtures")
    wb = openpyxl.load_workbook(arquivos[0])
    wv = openpyxl.load_workbook(arquivos[0], data_only=True)
    a = wv["A - CARACTERIZAÇÃO"]
    caso_inv = {"nivel": val(a["C108"].value), "ano": val(a["C7"].value),
                "exAnte": linhas_inventario(wb["2 - EX-ANTE"], wv["2 - EX-ANTE"], False),
                "exPost": linhas_inventario(wb["3 - EX-POST"], wv["3 - EX-POST"], True)}
    json.dump(caso_inv, open(os.path.join(fixtures, "inventario-exemplo.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(coleta(wv), open(os.path.join(fixtures, "coleta-exemplo.json"), "w"), ensure_ascii=False, indent=2)
    json.dump(base_checklist(arquivos[0]), open(destino.replace("textos.json", "checklist.json"), "w"),
              ensure_ascii=False, indent=2)
    json.dump(caso_reducao(arquivos[0]), open(os.path.join(fixtures, "reducao-exemplo.json"), "w"),
              ensure_ascii=False, indent=2)
    json.dump(caso_pos_evento(arquivos[0]), open(os.path.join(fixtures, "pos-evento-exemplo.json"), "w"),
              ensure_ascii=False, indent=2)
    for arq in arquivos:
        cc = caso_checklist(arq)
        nome = "checklist-nivel%d.json" % cc["nivel"]
        json.dump(cc, open(os.path.join(fixtures, nome), "w"), ensure_ascii=False, indent=2)
    for arq in arquivos:
        c = caso(arq)
        nome = "exemplo-nivel3" if c["esperado"]["nivelFinal"] == 3 else "copia-demonstracao"
        json.dump(c, open(os.path.join(RAIZ, "src/domain/metodologia/__tests__/fixtures", nome + ".json"), "w"),
                  ensure_ascii=False, indent=2)
        print("caso", nome, "nível", c["esperado"]["nivelFinal"])


if __name__ == "__main__":
    main(sys.argv[1:])
