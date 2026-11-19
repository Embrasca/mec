# Pontos a confirmar com a coordenação da metodologia (Ferramenta v3.16)

Encontrados na análise das planilhas. Até a confirmação, o sistema segue a planilha como está,
exceto onde indicado.

1. **Frase "Evento carbono neutro" inalcançável** — aba 7, célula B25 exige
   `'4 - RESULTADOS'!E41="OK"`, mas E41 é o texto fixo "Não há mínimo exigido". *(Afeta a
   Etapa 5; ainda não implementado.)*
2. **Código de fator repetido** — `E04` aparece para GLP e para energia solar (aba FATORES).
   No sistema o item é identificado pelo nome (como a própria planilha faz nas buscas), e o
   código fica só como referência.
3. **Elevação técnica sem justificativa** — na planilha o nível já sobe e C99 só avisa. No
   sistema o cálculo é o mesmo, mas **a confirmação do enquadramento fica bloqueada** até haver
   justificativa.
4. **Pontuação de complexidade sem conferência com os números** — o sistema mostra um aviso
   quando a opção escolhida fica abaixo do que os próprios números da ficha indicam (dias,
   diárias, porções, geradores, estrutura, voos, alegação). O cálculo não muda.
5. **Categorias prioritárias (80%)** — o texto da aba 4 cita a regra, mas a coluna só testa a
   materialidade de 5%. No sistema, a coluna "SIM - material" segue a fórmula, e uma marca
   "Prioritária" separada aplica a regra do texto: do maior para o menor, as categorias até a
   soma chegar a 80%.
6. **Limites fixos de linhas** — no sistema não existem.

## Decisões de implementação das Etapas 0 e 1

- A metodologia v3.16 fica num módulo versionado no código (`src/domain/metodologia/v3_16`),
  com textos extraídos da planilha por script. Cada evento guarda a versão com que foi
  criado; uma versão nova do Guia vira um módulo novo, sem alterar eventos em andamento.
- A identificação do evento (nome, instituição, cidade, datas) é digitada uma vez, no
  cadastro, como pede a planilha.
- A fase (pré-evento, execução, pós-evento) é derivada das datas.

## Decisões de implementação da Etapa 2

- Os textos de alerta que citavam "a aba FATORES" passaram a citar "a base de fatores".
- A coleta é guardada por etapa (previsão para o ex-ante; a do ex-post virá na Etapa 4). O
  botão "Lançar" leva o resumo ao inventário: atualiza as linhas que vieram da coleta e
  acrescenta as que faltam, sem tocar nas digitadas à mão.
- No quadro 1, se houver leituras do medidor e a parcela atribuída ao evento estiver vazia, o
  consumo conta zero, como na planilha; o sistema mostra uma pendência avisando disso.
- Fechar o ex-ante exige que não haja alertas e preserva o resultado e a base usada.
- A base de fatores do evento pode ser trocada pelo gestor só enquanto nenhum inventário
  estiver fechado ("nunca no meio de um evento").

## Decisões de implementação da Etapa 3

- **Checklist e plano de redução** seguem a planilha. Diferença: sem limite de 30 medidas.
- **Exigência de redução nos Níveis 3 e 4**: como na planilha, basta uma medida com meta
  numérica maior que zero para a conferência dar "OK". A planilha não confere se a meta está
  nas categorias de maior peso; o sistema mostra o ex-ante por categoria, do maior para o
  menor, para apoiar essa escolha.
- **Matriz impacto × relevância e plano de ação** não existem na Ferramenta: vêm do
  EventSustain, com os mesmos campos e a mesma regra de prioridade (soma ≥ 8 alta, ≥ 6
  média). Em vez de "eixo", o tema usa uma das 10 categorias da Ferramenta ou fica como tema
  fora do GEE. Mudança: "atrasada" deixou de ser escolhida à mão e passou a ser calculada pelo
  prazo; e ação concluída exige 100% de progresso.
- **Linha do tempo**: as fases vêm das datas do evento; reúne os prazos das medidas, das
  ações e da entrega de dados dos fornecedores, e o progresso do checklist de cada fase.
  Os itens do checklist têm "Quando" em texto (ex.: "Antes de contratar"), sem data, por isso
  aparecem como progresso e não como marcos.

## Decisões de implementação da Etapa 4

- **Inventário ex-post** usa a mesma tela do ex-ante, com qualidade do dado (lista da planilha,
  nota 0 a 5) e evidência. Os alertas seguem a coluna S da aba 3, na mesma ordem: quantidade,
  fator, qualidade, premissa (nota 2 ou menos), evidência (Nível 2 ou mais) e dado medido para
  fonte com 5% ou mais do total (Nível 3 ou mais). O banco não aceita qualidade nem evidência
  em linha de ex-ante.
- **Coleta do realizado** é a mesma aba COLETA, guardada à parte da previsão; "Lançar" leva o
  resumo ao ex-post. Linhas lançadas chegam sem qualidade nem evidência, para a equipe completar.
- **Ocorrências**: os campos e listas da aba. O aviso da planilha ("resolva as ocorrências
  abertas antes de fechar o inventário") virou regra: com ocorrência aberta ou em tratamento o
  ex-post não fecha, no serviço e no banco.
- **Resultados, comparação e compensação** reproduzem as abas 4, 5 e 6 e batem com o exemplo
  Nível 3. Enquanto o ex-post estiver aberto, as telas avisam que o resultado é provisório.
- **Comparação**: a origem e a explicação ficam por categoria; o sistema conta as categorias
  com diferença ainda sem origem ("classifique a causa de cada diferença"). Se o ex-ante não
  estiver fechado, a tela pede que seja fechado para preservar a estimativa original.
- **Compensação**: além dos números da aba 6, o sistema guarda o comprovante da aposentadoria
  ("aposentadoria comprovada, não apenas compra") e a descrição da medida omitida ("fica
  declarada"), e avisa quando faltam. O total a compensar arredonda para cima, como ROUNDUP.
