"""Gera src/domain/territorio/ibge.json a partir da API de localidades do IBGE.

Uso: python3 -I scripts/gerar-territorio.py <pasta com municipios.json,
regioes-metropolitanas.json e regioes-integradas-de-desenvolvimento.json>

Os arquivos vêm de https://servicodados.ibge.gov.br/api/v1/localidades/<nome>.
"""
import json, os, sys, datetime

pasta = sys.argv[1]
ler = lambda n: json.load(open(os.path.join(pasta, n + ".json"), encoding="utf-8"))
municipios = ler("municipios")
rms = ler("regioes-metropolitanas")
rides = ler("regioes-integradas-de-desenvolvimento")

imediatas = {}
lista = []
for m in municipios:
    ri = m["regiao-imediata"]
    uf = ri["regiao-intermediaria"]["UF"]["sigla"]
    imediatas[ri["id"]] = ri["nome"]
    lista.append([m["id"], m["nome"], uf, ri["id"]])
lista.sort(key=lambda x: (x[2], x[1]))

regioes = []
for r in rms:
    ids = sorted({x["id"] for x in r["municipios"]}
                 | {x["id"] for s in r.get("sub-regioes-metropolitanas", []) for x in s.get("municipios", [])})
    regioes.append({"id": "RM" + r["id"], "nome": r["nome"], "municipios": ids})
for r in rides:
    regioes.append({"id": "RIDE" + r["id"], "nome": r["nome"], "municipios": sorted({x["id"] for x in r["municipios"]})})

saida = {
    "fonte": "IBGE, API de localidades (servicodados.ibge.gov.br/api/v1/localidades)",
    "obtidoEm": datetime.date.today().isoformat(),
    "municipios": lista,
    "regioesImediatas": {str(k): v for k, v in sorted(imediatas.items())},
    "regioesMetropolitanas": regioes,
}
destino = os.path.join(os.path.dirname(__file__), "..", "src", "domain", "territorio", "ibge.json")
json.dump(saida, open(destino, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(lista), "municípios,", len(imediatas), "regiões imediatas,", len(regioes), "RMs e RIDEs")
