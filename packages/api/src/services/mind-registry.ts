import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import fp from "fastify-plugin";
import type { MindMetadata, MindSummary, Squad } from "@loyola-x/shared";

interface MindRegistry {
  getAll(): Squad[];
  getById(id: string): MindMetadata | undefined;
  search(query: string): Squad[];
}

declare module "fastify" {
  interface FastifyInstance {
    mindRegistry: MindRegistry;
  }
}

const ARTIFACT_KEY_MAP: Record<string, string> = {
  cognitive_os: "cognitiveOS",
  communication_dna: "communicationDNA",
  frameworks: "frameworks",
  value_equation: "valueEquation",
  antipattern: "antipatterns",
  case_library: "caseLibrary",
};

function mapArtifactKey(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [pattern, key] of Object.entries(ARTIFACT_KEY_MAP)) {
    if (lower.includes(pattern)) return key;
  }
  return null;
}

function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4);
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readFirstLine(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, { encoding: "utf-8" });
    const firstLine = content.slice(0, 512).split("\n").find((l) => l.trim().length > 0);
    return firstLine?.replace(/^#+\s*/, "").trim() ?? "";
  } catch {
    return "";
  }
}

async function scanMMOSMinds(
  squadPath: string,
  squadId: string,
  squadDisplayName: string
): Promise<MindMetadata[]> {
  const mindsDir = join(squadPath, "minds");
  if (!(await dirExists(mindsDir))) return [];

  const entries = await readdir(mindsDir, { withFileTypes: true });
  const minds: MindMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const mindDir = join(mindsDir, entry.name);
    const artifactsDir = join(mindDir, "artifacts");
    const systemPromptsDir = join(mindDir, "system_prompts");
    const configPath = join(mindDir, "docs", "config.json");

    // Read config.json if exists
    let name = entry.name.replace(/_/g, " ");
    let id = entry.name;
    try {
      const configRaw = await readFile(configPath, "utf-8");
      const config = JSON.parse(configRaw);
      if (config.name) name = config.name;
      if (config.id) id = config.id;
    } catch {
      // config.json optional
    }

    // Index artifact paths
    const artifactPaths: MindMetadata["artifactPaths"] = {
      cognitiveOS: null,
      communicationDNA: null,
      frameworks: null,
      valueEquation: null,
      antipatterns: null,
      caseLibrary: null,
    };
    const tags: string[] = [];
    let totalBytes = 0;

    // Check system_prompts/ for COGNITIVE_OS first
    if (await dirExists(systemPromptsDir)) {
      const spFiles = await readdir(systemPromptsDir);
      for (const f of spFiles) {
        if (f.toLowerCase().includes("cognitive_os")) {
          artifactPaths.cognitiveOS = join(systemPromptsDir, f);
        }
      }
    }

    // Scan artifacts/
    if (await dirExists(artifactsDir)) {
      const files = await readdir(artifactsDir);
      for (const f of files) {
        if (!f.endsWith(".md")) continue;
        const filePath = join(artifactsDir, f);
        const fileStat = await stat(filePath);
        totalBytes += fileStat.size;

        const key = mapArtifactKey(f);
        if (key && key in artifactPaths) {
          artifactPaths[key] = filePath;
        } else {
          artifactPaths[basename(f, ".md")] = filePath;
        }

        // Extract tag from filename
        const tag = f
          .replace(/^\d+_/, "")
          .replace(/\.md$/, "")
          .toLowerCase()
          .replace(/_/g, " ");
        tags.push(tag);
      }
    }

    // Extract specialty from COGNITIVE_OS first line
    const cogPath = artifactPaths.cognitiveOS;
    const specialty = cogPath ? await readFirstLine(cogPath) : "";

    // Count heuristics (files in artifacts that contain "heuristic")
    const heuristicPaths: string[] = [];
    if (await dirExists(artifactsDir)) {
      const files = await readdir(artifactsDir);
      for (const f of files) {
        if (f.toLowerCase().includes("heuristic")) {
          heuristicPaths.push(join(artifactsDir, f));
        }
      }
    }

    minds.push({
      id,
      name,
      squad: squadId,
      squadDisplayName,
      type: "mind",
      avatarUrl: null,
      tags,
      specialty,
      artifactPaths,
      heuristicPaths,
      totalTokenEstimate: estimateTokens(totalBytes),
    });
  }

  return minds;
}

async function scanAgents(
  agentsDir: string,
  squadId: string,
  squadDisplayName: string
): Promise<MindMetadata[]> {
  if (!(await dirExists(agentsDir))) return [];

  const entries = await readdir(agentsDir);
  const agents: MindMetadata[] = [];

  for (const file of entries) {
    if (!file.endsWith(".md")) continue;

    const filePath = join(agentsDir, file);
    const fileStat = await stat(filePath);
    const id = basename(file, ".md");

    // Read first ~2KB for YAML frontmatter
    const content = await readFile(filePath, "utf-8");
    const header = content.slice(0, 2048);

    // Extract name and title from YAML-like content
    let name = id.replace(/-/g, " ");
    let specialty = "";

    const nameMatch = header.match(/name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim().replace(/['"]/g, "");

    const titleMatch = header.match(/title:\s*(.+)/);
    if (titleMatch) specialty = titleMatch[1].trim().replace(/['"]/g, "");

    agents.push({
      id,
      name,
      squad: squadId,
      squadDisplayName,
      type: "agent",
      avatarUrl: null,
      tags: [],
      specialty,
      artifactPaths: {
        cognitiveOS: filePath,
        communicationDNA: null,
        frameworks: null,
        valueEquation: null,
        antipatterns: null,
        caseLibrary: null,
      },
      heuristicPaths: [],
      totalTokenEstimate: estimateTokens(fileStat.size),
    });
  }

  return agents;
}

async function scanSquads(basePath: string): Promise<{
  minds: Map<string, MindMetadata>;
  squads: Squad[];
}> {
  const minds = new Map<string, MindMetadata>();
  const squads: Squad[] = [];

  const entries = await readdir(basePath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const squadDir = join(basePath, entry.name);
    const squadId = entry.name;

    // Try to read squad display name from config.yaml
    const displayName = entry.name
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Check for MMOS pattern (has minds/ directory)
    const hasMindsDir = await dirExists(join(squadDir, "minds"));
    // Check for agents/ directory directly
    const hasAgentsDir = await dirExists(join(squadDir, "agents"));
    // Check for nested pattern (dopamine-learning/dopamine-learning/agents/)
    const nestedAgentsDir = join(squadDir, squadId, "agents");
    const hasNestedAgentsDir = await dirExists(nestedAgentsDir);

    const squadMinds: MindMetadata[] = [];

    if (hasMindsDir) {
      const scanned = await scanMMOSMinds(squadDir, squadId, displayName);
      squadMinds.push(...scanned);
    }

    if (hasAgentsDir) {
      const scanned = await scanAgents(
        join(squadDir, "agents"),
        squadId,
        displayName
      );
      squadMinds.push(...scanned);
    }

    if (hasNestedAgentsDir && !hasAgentsDir) {
      const scanned = await scanAgents(nestedAgentsDir, squadId, displayName);
      squadMinds.push(...scanned);
    }

    if (squadMinds.length === 0) continue;

    // Add minds to global map
    for (const mind of squadMinds) {
      minds.set(mind.id, mind);
    }

    // Build squad summary
    const mindSummaries: MindSummary[] = squadMinds.map((m) => ({
      id: m.id,
      name: m.name,
      squad: m.squad,
      specialty: m.specialty,
      tags: m.tags,
      avatarUrl: m.avatarUrl,
      totalTokenEstimate: m.totalTokenEstimate,
    }));

    squads.push({
      id: squadId,
      name: squadId,
      displayName,
      description: "",
      mindCount: squadMinds.length,
      minds: mindSummaries,
    });
  }

  return { minds, squads };
}

export default fp(async function mindRegistryPlugin(fastify) {
  const basePath = fastify.config.MINDS_BASE_PATH;
  let mindsMap = new Map<string, MindMetadata>();
  let squadsCache: Squad[] = [];

  fastify.addHook("onReady", async () => {
    try {
      const result = await scanSquads(basePath);
      mindsMap = result.minds;
      squadsCache = result.squads;
      fastify.log.info(
        { mindCount: mindsMap.size, squadCount: squadsCache.length },
        "MindRegistry initialized"
      );
    } catch (err) {
      fastify.log.warn({ err }, "MindRegistry scan failed — continuing without minds");
    }
  });

  const registry: MindRegistry = {
    getAll() {
      return squadsCache;
    },

    getById(id: string) {
      return mindsMap.get(id);
    },

    search(query: string) {
      const q = query.toLowerCase();
      return squadsCache
        .map((squad) => ({
          ...squad,
          minds: squad.minds.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.specialty.toLowerCase().includes(q) ||
              m.tags.some((t) => t.toLowerCase().includes(q))
          ),
        }))
        .filter((s) => s.minds.length > 0)
        .map((s) => ({ ...s, mindCount: s.minds.length }));
    },
  };

  fastify.decorate("mindRegistry", registry);
});

export { scanSquads, scanMMOSMinds, scanAgents };
