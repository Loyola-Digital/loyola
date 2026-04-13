# Netao Bom Beef — AI Mind Clone

## Quem e
**Domingos Neto (Netao)** — Acougueiro, empreendedor, educador de churrasco, fundador do Grupo Bom Beef. De entregador de bicicleta aos 17 anos a CEO de um imperio de R$300M+ com 100+ unidades em 13 estados. 8o mais influente do churrasco no mundo. 5M+ seguidores.

## Status
- **Cobertura DNA Mental:** 90%
- **Fidelity Target:** 85-92%
- **Phase:** Implementation complete, pending validation

## Estrutura

```
minds/netao/
├── metadata.yaml                          # Pipeline, metricas, biografia
├── README.md                              # Este arquivo
├── artifacts/
│   ├── identity-core.yaml                 # Layers 6-8 (valores, obsessoes, paradoxos)
│   ├── layer-5-mental-models.yaml         # Frameworks de negocio, churrasco, lideranca
│   └── communication-style.md             # Guia de voz e tom
├── system_prompts/
│   └── generalista.md                     # THE MIND — system prompt principal
├── sources/
│   ├── videos/                            # Transcricoes de videos (a serem salvas)
│   └── articles/                          # Artigos e entrevistas
├── kb/
│   └── domains/                           # Knowledge base chunks (futuro)
└── docs/
    └── (validacao e documentacao futura)
```

## Fontes Processadas

| # | Fonte | Tipo | Tier |
|---|-------|------|------|
| 1 | Compilado vida + produto + tecnica | Summary | 1 |
| 2 | Blog Hiel Levy (DSX 2026) | Article | 3 |
| 3 | Juicy Santos (CreativeMornings) | Article | 2 |
| 4 | Exame (imperio R$300M) | Article | 2 |
| 5 | Video: Alfredo Soares / G4 | Transcription | 1 |
| 6 | Video: Renato Cariani churrasco | Transcription | 1 |
| 7 | Video: 10 anos de acougue | Transcription | 1 |
| 8 | Video: Padrinho Podcast (completo) | Transcription | 1 |
| 9 | Video: Churrasco pro americano | Transcription | 1 |
| 10 | Video: Inauguracao aeroporto | Transcription | 1 |

## Como Usar

O arquivo principal e `system_prompts/generalista.md`. Cole como system prompt em qualquer LLM (Claude, GPT, etc.) e a IA responde como o Netao.

Para contexto mais profundo, carregue tambem:
- `artifacts/identity-core.yaml` (valores e obsessoes)
- `artifacts/layer-5-mental-models.yaml` (frameworks)
- `artifacts/communication-style.md` (guia de voz)

## Proximos Passos
1. Validacao com usuario (testar fidelidade)
2. Adicionar transcricoes dos videos 6-9
3. Criar kb/ chunks para RAG
4. Refinar system prompt baseado em feedback
