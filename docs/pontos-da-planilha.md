# Pontos a confirmar com a coordenação da metodologia (Ferramenta v3.16)

Encontrados na análise das planilhas. Até a confirmação, o sistema segue a planilha como está,
exceto onde indicado.

1. **Frase "Evento carbono neutro" inalcançável** — aba 7, célula B25 exige
   `'4 - RESULTADOS'!E41="OK"`, mas E41 é o texto fixo "Não há mínimo exigido". *(Afeta a
   Etapa 5; ainda não implementado.)*
2. **Código de fator repetido** — `E04` aparece para GLP e para energia solar (aba FATORES).
   *(Afeta a Etapa 2.)*
3. **Elevação técnica sem justificativa** — na planilha o nível já sobe e C99 só avisa. No
   sistema o cálculo é o mesmo, mas **a confirmação do enquadramento fica bloqueada** até haver
   justificativa.
4. **Pontuação de complexidade sem conferência com os números** — o sistema mostra um aviso
   quando a opção escolhida fica abaixo do que os próprios números da ficha indicam (dias,
   diárias, porções, geradores, estrutura, voos, alegação). O cálculo não muda.
5. **Categorias prioritárias (80%)** — o texto da aba 4 cita a regra, mas a coluna só testa a
   materialidade de 5%. *(Afeta a Etapa 4.)*
6. **Limites fixos de linhas** — no sistema não existem.

## Decisões de implementação das Etapas 0 e 1

- A metodologia v3.16 fica num módulo versionado no código (`src/domain/metodologia/v3_16`),
  com textos extraídos da planilha por script. Cada evento guarda a versão com que foi
  criado; uma versão nova do Guia vira um módulo novo, sem alterar eventos em andamento.
- A identificação do evento (nome, instituição, cidade, datas) é digitada uma vez, no
  cadastro, como pede a planilha.
- A fase (pré-evento, execução, pós-evento) é derivada das datas.
