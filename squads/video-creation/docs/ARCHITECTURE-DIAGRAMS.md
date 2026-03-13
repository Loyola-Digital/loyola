# Diagramas de Arquitetura

> Diagramas Mermaid mostrando a arquitetura, fluxo de agentes, pipeline de producao e fluxo de dados do Video Creation Squad.

---

## Indice

1. [Visao Geral do Squad](#visao-geral-do-squad)
2. [Fluxo de Interacao entre Agentes](#fluxo-de-interacao-entre-agentes)
3. [Pipeline de Producao de Video](#pipeline-de-producao-de-video)
4. [Fases do Workflow wf-create-video](#fases-do-workflow-wf-create-video)
5. [Fluxo de Dados entre Agentes](#fluxo-de-dados-entre-agentes)
6. [Arvore de Decisao de Modelos](#arvore-de-decisao-de-modelos)
7. [Workflow de Setup do Ambiente](#workflow-de-setup-do-ambiente)
8. [Pipeline de Consistencia de Personagens](#pipeline-de-consistencia-de-personagens)
9. [Pipeline de Enhancement](#pipeline-de-enhancement)
10. [Modos de Execucao](#modos-de-execucao)

---

## Visao Geral do Squad

Hierarquia dos agentes e suas responsabilidades:

```mermaid
graph TB
    subgraph ORCHESTRATOR["ORCHESTRATOR TIER"]
        VD["video-director<br/>Orquestra todo o pipeline"]
    end

    subgraph SPECIALISTS["SPECIALIST TIER"]
        VG["video-generator<br/>T2V / I2V / V2V"]
        VE["video-enhancer<br/>Upscaling / Interpolation"]
        CD["character-designer<br/>IP-Adapter / FaceID"]
        AP["audio-producer<br/>Voz / Musica / SFX"]
    end

    subgraph SUPPORT["SUPPORT TIER"]
        PE["prompt-engineer<br/>Otimizacao de prompts"]
        QR["quality-reviewer<br/>Validacao de qualidade"]
        CA["comfyui-admin<br/>Setup / Manutencao"]
    end

    VD --> VG
    VD --> VE
    VD --> CD
    VD --> AP
    VD --> PE
    VD --> QR
    VD --> CA

    VG -.->|"prompts otimizados"| PE
    VG -.->|"embeddings faciais"| CD
    VE -.->|"review de qualidade"| QR
    AP -.->|"review de audio"| QR

    style VD fill:#4a90d9,stroke:#2c5f8a,color:#fff
    style VG fill:#50c878,stroke:#2d8a4e,color:#fff
    style VE fill:#50c878,stroke:#2d8a4e,color:#fff
    style CD fill:#50c878,stroke:#2d8a4e,color:#fff
    style AP fill:#50c878,stroke:#2d8a4e,color:#fff
    style PE fill:#f4a460,stroke:#c4783a,color:#fff
    style QR fill:#f4a460,stroke:#c4783a,color:#fff
    style CA fill:#f4a460,stroke:#c4783a,color:#fff
```

---

## Fluxo de Interacao entre Agentes

Sequencia detalhada de como os agentes interagem durante a criacao de um video:

```mermaid
sequenceDiagram
    actor User
    participant VD as video-director
    participant PE as prompt-engineer
    participant CD as character-designer
    participant CA as comfyui-architect
    participant MD as motion-designer
    participant PP as post-production

    User->>VD: /video-create "briefing do video"

    Note over VD: FASE 1: PRE-PRODUCAO
    VD->>VD: Analise do briefing
    VD->>VD: Criacao do shot list
    VD->>PE: Solicita prompts para cada shot
    PE->>PE: Crafta prompts otimizados
    PE->>PE: Define negative prompts
    PE-->>VD: Retorna prompts por shot

    opt Se tem personagens
        VD->>CD: Solicita character references
        CD->>CD: Cria reference sheets
        CD->>CD: Gera embeddings IP-Adapter/FaceID
        CD-->>VD: Retorna embeddings e configs
    end

    Note over VD: CHECKPOINT: Pre-producao aprovada?
    VD->>User: Apresenta shot list para aprovacao
    User->>VD: Aprovado

    Note over VD: FASE 2: GERACAO
    loop Para cada shot
        VD->>CA: Solicita workflow ComfyUI
        CA->>CA: Monta node graph
        CA->>CA: Configura modelo/sampler/scheduler
        CA-->>VD: Workflow pronto
        VD->>CA: Executa geracao
        CA-->>VD: Video bruto gerado

        VD->>MD: Valida motion e temporal consistency
        MD-->>VD: Aprovado / Requer re-geracao
    end

    Note over VD: FASE 3: ENHANCEMENT
    VD->>MD: Solicita frame interpolation
    MD->>MD: GIMM-VFI: 16fps -> 48fps
    MD-->>VD: Frames interpolados

    VD->>PP: Solicita upscaling
    PP->>PP: SeedVR2: 720p -> 1080p/4K
    PP-->>VD: Video upscaled

    Note over VD: FASE 4: POS-PRODUCAO
    VD->>PP: Solicita audio e montagem
    PP->>PP: Color grading
    PP->>PP: Transicoes entre shots
    PP->>PP: Geracao de audio (voz, musica, SFX)
    PP->>PP: Mix e timeline assembly
    PP-->>VD: Video final montado

    Note over VD: FASE 5: ENTREGA
    VD->>User: Apresenta video final
    User->>VD: Aprovado / Solicita ajustes
```

---

## Pipeline de Producao de Video

Visao macro do pipeline completo, desde o input do usuario ate a entrega final:

```mermaid
flowchart LR
    subgraph INPUT["INPUT"]
        B["Briefing / Script"]
        R["Referencias visuais"]
        C["Config: modelo,<br/>resolucao, fps"]
    end

    subgraph PREFLIGHT["PRE-FLIGHT"]
        PF1["Verificar ComfyUI"]
        PF2["Verificar modelos"]
        PF3["Verificar VRAM"]
        PF4["Coletar parametros"]
    end

    subgraph PHASE1["FASE 1: PRE-PRODUCAO"]
        P1A["Analise de briefing"]
        P1B["Shot list"]
        P1C["Prompts por shot"]
        P1D["Character refs"]
    end

    subgraph PHASE2["FASE 2: GERACAO"]
        P2A["Montar workflow<br/>ComfyUI"]
        P2B["T2V / I2V / V2V"]
        P2C["Validar<br/>consistencia"]
        P2D{{"Qualidade<br/>OK?"}}
        P2E["Re-gerar"]
    end

    subgraph PHASE3["FASE 3: ENHANCEMENT"]
        P3A["Frame interpolation<br/>GIMM-VFI"]
        P3B["Upscaling<br/>SeedVR2"]
        P3C["Correcao de<br/>artefatos"]
    end

    subgraph PHASE4["FASE 4: POS-PRODUCAO"]
        P4A["Color grading"]
        P4B["Transicoes"]
        P4C["Audio: Voz<br/>ElevenLabs"]
        P4D["Audio: Musica<br/>Suno / Udio"]
        P4E["Audio: SFX<br/>ElevenLabs"]
        P4F["Mix final"]
    end

    subgraph OUTPUT["OUTPUT"]
        O1["Video final<br/>renderizado"]
        O2["Assets individuais<br/>(shots, audio)"]
    end

    INPUT --> PREFLIGHT
    PREFLIGHT --> PHASE1
    PHASE1 --> PHASE2
    P2A --> P2B --> P2C --> P2D
    P2D -->|"Sim"| PHASE3
    P2D -->|"Nao"| P2E --> P2A
    PHASE3 --> PHASE4
    PHASE4 --> OUTPUT
```

---

## Fases do Workflow wf-create-video

Detalhamento das fases com checkpoints e gates:

```mermaid
flowchart TB
    START(["Inicio: /video-create"]) --> PF

    subgraph PF["PRE-FLIGHT (Blocking)"]
        PF1["Verificar ComfyUI @ 127.0.0.1:8188"]
        PF2["Verificar custom nodes instalados"]
        PF3["Verificar modelo de video disponivel"]
        PF4["Verificar espaco em disco >= 50GB"]
        PF5["Verificar VRAM >= 12GB"]
        PF6["Coletar parametros do projeto"]
    end

    PF --> CP0{{"CP_PRE_FLIGHT<br/>Ambiente OK?"}}
    CP0 -->|"Falha"| SETUP["Executar wf-setup-environment"]
    SETUP --> PF
    CP0 -->|"OK"| PH1

    subgraph PH1["FASE 1: PRE-PRODUCAO"]
        direction TB
        PH1A["Analise do briefing"]
        PH1B["Geracao de script (se necessario)"]
        PH1C["Decomposicao em shots"]
        PH1D["Prompt engineering por shot"]
        PH1E["Character setup (se necessario)"]
        PH1A --> PH1B --> PH1C --> PH1D --> PH1E
    end

    PH1 --> CP1{{"CP_PHASE_1<br/>Pre-producao completa?"}}
    CP1 -->|"Aprovado"| PH2
    CP1 -->|"Ajustar"| PH1

    subgraph PH2["FASE 2: GERACAO"]
        direction TB
        PH2A["Selecao de modelo por shot"]
        PH2B["Montagem de workflow ComfyUI"]
        PH2C["Execucao da geracao"]
        PH2D["Validacao de qualidade"]
        PH2E["Verificacao de consistencia"]
        PH2A --> PH2B --> PH2C --> PH2D --> PH2E
    end

    PH2 --> CP2{{"CP_PHASE_2<br/>Geracao OK?"}}
    CP2 -->|"Aprovado"| PH3
    CP2 -->|"Re-gerar"| PH2

    subgraph PH3["FASE 3: ENHANCEMENT"]
        direction TB
        PH3A["Frame interpolation (GIMM-VFI)"]
        PH3B["Upscaling (SeedVR2)"]
        PH3C["Correcao de artefatos"]
        PH3A --> PH3B --> PH3C
    end

    PH3 --> CP3{{"CP_PHASE_3<br/>Enhancement OK?"}}
    CP3 -->|"Aprovado"| PH4
    CP3 -->|"Ajustar"| PH3

    subgraph PH4["FASE 4: POS-PRODUCAO"]
        direction TB
        PH4A["Color grading e correcao"]
        PH4B["Transicoes entre shots"]
        PH4C["Geracao de audio"]
        PH4D["Sincronizacao audio/video"]
        PH4E["Mix final"]
        PH4A --> PH4B --> PH4C --> PH4D --> PH4E
    end

    PH4 --> CP4{{"CP_PHASE_4<br/>Audio OK?"}}
    CP4 -->|"Aprovado"| PH5
    CP4 -->|"Ajustar"| PH4

    subgraph PH5["FASE 5: ENTREGA"]
        direction TB
        PH5A["Timeline assembly"]
        PH5B["Render final"]
        PH5C["Exportacao"]
        PH5A --> PH5B --> PH5C
    end

    PH5 --> CP5{{"CP_PHASE_5<br/>Final aprovado?"}}
    CP5 -->|"Aprovado"| FIM(["Video entregue"])
    CP5 -->|"Ajustar"| PH4

    style START fill:#4a90d9,color:#fff
    style FIM fill:#50c878,color:#fff
```

---

## Fluxo de Dados entre Agentes

O que cada agente produz e consome:

```mermaid
flowchart TB
    subgraph USER_INPUT["Inputs do Usuario"]
        UI1["Briefing / Script"]
        UI2["Imagens de referencia"]
        UI3["Configuracoes"]
    end

    subgraph VD_DATA["video-director"]
        VD1["Shot list"]
        VD2["Project state"]
        VD3["Quality gates"]
    end

    subgraph PE_DATA["prompt-engineer"]
        PE1["Prompts otimizados<br/>(positivo + negativo)"]
        PE2["Keywords de estilo"]
        PE3["Configuracao de<br/>LoRA triggers"]
    end

    subgraph CD_DATA["character-designer"]
        CD1["Reference sheets"]
        CD2["IP-Adapter embeddings"]
        CD3["InsightFace embeddings"]
        CD4["Configuracao FaceID"]
    end

    subgraph CA_DATA["comfyui-architect"]
        CA1["Workflow JSON<br/>por shot"]
        CA2["Configuracao de<br/>modelo/sampler"]
        CA3["Videos brutos<br/>gerados"]
    end

    subgraph MD_DATA["motion-designer"]
        MD1["Camera motion plans"]
        MD2["Frames interpolados"]
        MD3["Motion validation<br/>reports"]
    end

    subgraph PP_DATA["post-production"]
        PP1["Videos upscaled"]
        PP2["Audio tracks<br/>(voz, musica, SFX)"]
        PP3["Video final<br/>renderizado"]
    end

    UI1 --> VD1
    UI2 --> CD1
    UI3 --> VD_DATA

    VD1 --> PE_DATA
    VD1 --> CA_DATA
    VD1 --> CD_DATA

    PE1 --> CA1
    PE2 --> CA1
    CD2 --> CA1
    CD3 --> CA1
    CD4 --> CA1

    CA3 --> MD_DATA
    MD1 --> CA1
    MD2 --> PP_DATA

    CA3 --> PP_DATA
    PP1 --> PP3
    PP2 --> PP3

    PP3 -->|"Entrega"| USER_OUTPUT["Video Final para Usuario"]

    style USER_INPUT fill:#e8e8e8,stroke:#999
    style USER_OUTPUT fill:#50c878,stroke:#2d8a4e,color:#fff
```

---

## Arvore de Decisao de Modelos

Como o squad seleciona o modelo ideal baseado em VRAM e objetivo:

```mermaid
flowchart TB
    START(["Selecao de Modelo"]) --> VRAM{"Quanta VRAM<br/>disponivel?"}

    VRAM -->|"<= 8 GB"| LOW_VRAM
    VRAM -->|"12-16 GB"| MID_VRAM
    VRAM -->|">= 24 GB"| HIGH_VRAM

    subgraph LOW_VRAM["VRAM <= 8 GB"]
        LV1{"Tipo de<br/>conteudo?"}
        LV1 -->|"Estilo SD"| LV_AD["AnimateDiff v3<br/>8 GB"]
        LV1 -->|"Realista"| LV_LTX["LTX-2 2B<br/>8 GB"]
        LV1 -->|"Teste rapido"| LV_WAN["Wan 1.3B<br/>6 GB, 480p"]
    end

    subgraph MID_VRAM["VRAM 12-16 GB"]
        MV1{"Tipo de<br/>conteudo?"}
        MV1 -->|"Qualidade geral"| MV_WAN["Wan 5B<br/>12 GB, 720p"]
        MV1 -->|"Texto em video"| MV_COG["CogVideoX-5B<br/>16 GB"]
        MV1 -->|"Rapido"| MV_LTX["LTX-2 ~8B<br/>12-16 GB"]
    end

    subgraph HIGH_VRAM["VRAM >= 24 GB"]
        HV1{"Prioridade?"}
        HV1 -->|"Qualidade maxima"| HV_WAN["Wan 14B<br/>24 GB, 1080p"]
        HV1 -->|"Rostos humanos"| HV_HUN["HunyuanVideo<br/>24 GB"]
        HV1 -->|"Flexibilidade"| HV_LTX["LTX-2 13B<br/>24 GB"]
        HV1 -->|"V2V / ControlNet"| HV_WAN2["Wan 2.2<br/>24 GB"]
    end

    style START fill:#4a90d9,color:#fff
    style LV_AD fill:#f4a460
    style LV_LTX fill:#f4a460
    style LV_WAN fill:#f4a460
    style MV_WAN fill:#50c878,color:#fff
    style MV_COG fill:#50c878,color:#fff
    style MV_LTX fill:#50c878,color:#fff
    style HV_WAN fill:#4a90d9,color:#fff
    style HV_HUN fill:#4a90d9,color:#fff
    style HV_LTX fill:#4a90d9,color:#fff
    style HV_WAN2 fill:#4a90d9,color:#fff
```

---

## Workflow de Setup do Ambiente

Fluxo do `wf-setup-environment`:

```mermaid
flowchart TB
    START(["Inicio: /video-setup"]) --> CHECK

    subgraph CHECK["VERIFICACAO INICIAL"]
        C1["Python 3.10+ instalado?"]
        C2["pip/conda disponivel?"]
        C3["git instalado?"]
        C4["50GB+ disco livre?"]
        C5["Internet disponivel?"]
    end

    CHECK --> C_OK{{"Tudo OK?"}}
    C_OK -->|"Nao"| GUIDE["Guiar usuario na<br/>instalacao manual"]
    C_OK -->|"Sim"| PH1

    subgraph PH1["FASE 1: NODES"]
        direction TB
        N1["Verificar ComfyUI base"]
        N2["Instalar core nodes:<br/>VideoHelperSuite<br/>WanVideoWrapper<br/>IPAdapter_plus"]
        N3["Instalar nodes opcionais:<br/>HunyuanWrapper<br/>CogVideoXWrapper<br/>LTXVideo<br/>AnimateDiff-Evolved"]
        N4["Instalar nodes de enhancement:<br/>Advanced-ControlNet<br/>Steerable-Motion<br/>SeedVR2<br/>GIMM-VFI<br/>TopazVideoAI"]
        N1 --> N2 --> N3 --> N4
    end

    PH1 --> CP1{{"Nodes OK?"}}
    CP1 -->|"Falha"| FIX1["Reinstalar nodes<br/>com falha"]
    FIX1 --> PH1
    CP1 -->|"OK"| PH2

    subgraph PH2["FASE 2: MODELOS"]
        direction TB
        M1["Selecionar modelos<br/>baseado em VRAM"]
        M2["Download modelos<br/>de video"]
        M3["Download modelos<br/>IP-Adapter/FaceID"]
        M4["Download modelos<br/>de upscaling"]
        M5["Verificar integridade"]
        M1 --> M2 --> M3 --> M4 --> M5
    end

    PH2 --> CP2{{"Modelos OK?"}}
    CP2 -->|"Falha"| FIX2["Re-download modelos<br/>corrompidos"]
    FIX2 --> PH2
    CP2 -->|"OK"| PH3

    subgraph PH3["FASE 3: VALIDACAO"]
        direction TB
        V1["Iniciar ComfyUI"]
        V2["Carregar workflow de teste"]
        V3["Gerar video de teste<br/>(3s, 480p)"]
        V4["Verificar output"]
        V1 --> V2 --> V3 --> V4
    end

    PH3 --> CP3{{"Teste OK?"}}
    CP3 -->|"Falha"| DIAG["Diagnostico detalhado"]
    CP3 -->|"OK"| FIM(["Ambiente configurado<br/>Pronto para uso!"])

    style START fill:#4a90d9,color:#fff
    style FIM fill:#50c878,color:#fff
    style GUIDE fill:#e74c3c,color:#fff
    style DIAG fill:#e74c3c,color:#fff
```

---

## Pipeline de Consistencia de Personagens

Detalhamento do fluxo de consistencia facial entre shots:

```mermaid
flowchart TB
    subgraph INPUT["Input"]
        I1["Foto de referencia<br/>do personagem"]
        I2["Nome do personagem"]
        I3["Descricao (opcional)"]
    end

    subgraph DETECT["DETECCAO FACIAL"]
        D1["InsightFace:<br/>Detectar rosto"]
        D2["Extrair landmarks<br/>faciais"]
        D3["Gerar face embedding<br/>(512-dim vector)"]
    end

    subgraph ADAPT["IP-ADAPTER SETUP"]
        A1["Carregar IP-Adapter<br/>FaceID Plus V2"]
        A2["Carregar CLIP<br/>Vision model"]
        A3["Processar referencia<br/>pelo CLIP"]
        A4["Gerar IP-Adapter<br/>embedding"]
    end

    subgraph STORE["ARMAZENAMENTO"]
        S1["Salvar face embedding"]
        S2["Salvar IP-Adapter config"]
        S3["Gerar reference sheet<br/>(multiplos angulos)"]
    end

    subgraph APPLY["APLICACAO POR SHOT"]
        AP1["Carregar embeddings<br/>do personagem"]
        AP2["Injetar no workflow<br/>ComfyUI"]
        AP3["Ajustar weight<br/>(0.6-0.9)"]
        AP4["Gerar shot com<br/>consistencia"]
    end

    subgraph VALIDATE["VALIDACAO"]
        V1["Comparar rosto gerado<br/>com referencia"]
        V2["Calcular similarity<br/>score"]
        V3{{"Score >= 0.85?"}}
        V4["Aprovar shot"]
        V5["Re-gerar com<br/>weight ajustado"]
    end

    INPUT --> DETECT --> ADAPT --> STORE
    STORE --> APPLY --> VALIDATE
    V3 -->|"Sim"| V4
    V3 -->|"Nao"| V5 --> APPLY

    style V4 fill:#50c878,color:#fff
    style V5 fill:#e74c3c,color:#fff
```

---

## Pipeline de Enhancement

Fluxo detalhado do processo de melhoria de video:

```mermaid
flowchart LR
    subgraph RAW["VIDEO BRUTO"]
        R1["16 fps<br/>480-720p<br/>Com artefatos"]
    end

    subgraph INTERP["FRAME INTERPOLATION"]
        I1["GIMM-VFI"]
        I2["16fps -> 48fps"]
        I3["ou RIFE como<br/>alternativa"]
    end

    subgraph UPSCALE["UPSCALING"]
        U1["SeedVR2<br/>AI Upscaling"]
        U2["720p -> 1080p<br/>ou 1080p -> 4K"]
        U3["Alternativa:<br/>Topaz Video AI"]
    end

    subgraph QUALITY["QUALITY CHECK"]
        Q1["Verificar artefatos"]
        Q2["Verificar consistencia<br/>temporal"]
        Q3["Verificar resolucao<br/>efetiva"]
        Q4{{"Aprovado?"}}
    end

    subgraph FINAL["VIDEO ENHANCED"]
        F1["48fps<br/>1080p-4K<br/>Qualidade producao"]
    end

    RAW --> INTERP --> UPSCALE --> QUALITY
    Q4 -->|"Sim"| FINAL
    Q4 -->|"Nao"| RAW

    style RAW fill:#e74c3c,color:#fff
    style FINAL fill:#50c878,color:#fff
```

---

## Modos de Execucao

Comparacao visual dos tres modos de execucao:

```mermaid
flowchart TB
    subgraph QUALITY["MODO QUALITY"]
        direction TB
        Q1["Pre-Flight"] --> QCP1{{"Checkpoint"}}
        QCP1 --> Q2["Pre-Producao"]
        Q2 --> QCP2{{"Checkpoint + Review"}}
        QCP2 --> Q3["Geracao"]
        Q3 --> QCP3{{"Checkpoint + Review"}}
        QCP3 --> Q4["Enhancement"]
        Q4 --> QCP4{{"Checkpoint + Review"}}
        QCP4 --> Q5["Pos-Producao"]
        Q5 --> QCP5{{"Checkpoint + Review"}}
        QCP5 --> Q6["Entrega"]
        Q6 --> QCP6{{"Checkpoint Final"}}
    end

    subgraph FAST["MODO FAST"]
        direction TB
        F1["Pre-Flight"] --> FCP1{{"Checkpoint"}}
        FCP1 --> F2["Pre-Producao<br/>(auto)"]
        F2 --> F3["Geracao<br/>(auto)"]
        F3 --> F4["Sem Enhancement"]
        F4 --> F5["Pos-Producao<br/>(auto)"]
        F5 --> F6["Entrega"]
        F6 --> FCP6{{"Checkpoint Final"}}
    end

    subgraph HYBRID["MODO HYBRID"]
        direction TB
        H1["Pre-Flight"] --> HCP1{{"Checkpoint"}}
        HCP1 --> H2["Pre-Producao"]
        H2 --> HCP2{{"Review Criativo"}}
        HCP2 --> H3["Geracao<br/>(auto)"]
        H3 --> H4["Enhancement<br/>(auto)"]
        H4 --> HCP4{{"Review Criativo"}}
        HCP4 --> H5["Pos-Producao<br/>(auto)"]
        H5 --> H6["Entrega"]
        H6 --> HCP6{{"Checkpoint Final"}}
    end

    style QUALITY fill:#e8f4e8,stroke:#50c878
    style FAST fill:#fff3e0,stroke:#f4a460
    style HYBRID fill:#e3f2fd,stroke:#4a90d9
```

---

## Diagrama de Infraestrutura

Componentes tecnicos e suas conexoes:

```mermaid
graph TB
    subgraph AIOS["AIOS Framework"]
        CC["Claude Code"]
        AG["Agentes do Squad"]
    end

    subgraph COMFYUI["ComfyUI Server"]
        CU["ComfyUI Core<br/>http://127.0.0.1:8188"]
        CN["Custom Nodes"]
        WF["Workflow Engine"]
    end

    subgraph GPU["GPU / Compute"]
        CUDA["CUDA 12.1+"]
        PT["PyTorch 2.0+"]
        VRAM["VRAM (12-24 GB)"]
    end

    subgraph MODELS["Modelos"]
        VM["Video Models<br/>Wan, Hunyuan, CogVideoX, LTX"]
        UM["Enhancement Models<br/>SeedVR2, GIMM-VFI"]
        CM["Consistency Models<br/>IP-Adapter, FaceID"]
    end

    subgraph EXTERNAL["APIs Externas"]
        EL["ElevenLabs<br/>Voz + SFX"]
        SU["Suno<br/>Musica"]
        UD["Udio<br/>Instrumental"]
    end

    subgraph STORAGE["Armazenamento"]
        DK["Disco SSD<br/>Modelos + Outputs"]
        FF["ffmpeg<br/>Encoding + Muxing"]
    end

    CC --> AG
    AG -->|"API calls"| CU
    CU --> CN
    CU --> WF
    WF --> GPU
    GPU --> MODELS
    AG -->|"API calls"| EXTERNAL
    GPU --> STORAGE
    EXTERNAL --> STORAGE
    FF --> STORAGE

    style AIOS fill:#4a90d9,color:#fff
    style COMFYUI fill:#50c878,color:#fff
    style GPU fill:#f4a460,color:#fff
```

---

## Notas sobre os Diagramas

### Como visualizar

Estes diagramas usam a sintaxe **Mermaid**. Para visualiza-los:

1. **VS Code:** Instale a extensao "Markdown Preview Mermaid Support"
2. **GitHub/GitLab:** Renderizam Mermaid automaticamente em arquivos .md
3. **Online:** Cole o codigo em [mermaid.live](https://mermaid.live/)
4. **Obsidian:** Suporte nativo a Mermaid

### Convencoes de cores

| Cor | Significado |
|-----|-------------|
| Azul (#4a90d9) | Orchestrator / decisoes principais |
| Verde (#50c878) | Specialists / sucesso / outputs |
| Laranja (#f4a460) | Support / warning / processo |
| Vermelho (#e74c3c) | Falha / requer atencao |
| Cinza (#e8e8e8) | Inputs do usuario |

---

*Video Creation Squad - AIOS v1.0.0*
*Documentacao atualizada em Fevereiro 2026*
