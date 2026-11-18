"""Extrai da Ferramenta MEC/GIZ v3.16 (.xlsx) os textos da metodologia e os
casos de referência usados nos testes do motor de nível.

Uso:  python3 -I scripts/extrair-metodologia.py <ferramenta.xlsx> [<outra.xlsx> ...]

Gera:
  src/domain/metodologia/v3_16/textos.json        (listas, requisitos, roteiro)
  src/domain/metodologia/__tests__/fixtures/*.json (entradas e resultados da aba A)

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


def main(arquivos):
    t = textos(arquivos[0])
    destino = os.path.join(RAIZ, "src/domain/metodologia/v3_16/textos.json")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    json.dump(t, open(destino, "w"), ensure_ascii=False, indent=2)
    for arq in arquivos:
        c = caso(arq)
        nome = re.sub(r"[^a-z0-9]+", "-", os.path.basename(arq).lower()).strip("-")[:60]
        json.dump(c, open(os.path.join(RAIZ, "src/domain/metodologia/__tests__/fixtures", nome + ".json"), "w"),
                  ensure_ascii=False, indent=2)
        print("caso", nome, "nível", c["esperado"]["nivelFinal"])


if __name__ == "__main__":
    main(sys.argv[1:])
