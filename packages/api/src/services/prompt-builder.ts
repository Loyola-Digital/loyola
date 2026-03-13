import type { MindMetadata } from "@loyola-x/shared";
import type { ArtifactCache } from "./artifact-cache.js";

const TASK_DELEGATION_PROMPT = `
## Task Delegation Capability

When the user asks you to create, schedule, or delegate a task:
1. Acknowledge the request in your persona's voice
2. Summarize the task clearly
3. End your message with exactly this JSON block:

\`\`\`json:task
{
  "action": "create_task",
  "title": "Task title here",
  "description": "Detailed description",
  "priority": 2,
  "tags": ["tag1", "tag2"]
}
\`\`\`

The system will detect this block and prompt the user to confirm task creation in ClickUp.
Do NOT mention ClickUp by name — just say "I can create a task for that."
`.trim();

export async function buildSystemPrompt(
  mind: MindMetadata,
  tier: 1 | 2 | 3,
  cache: ArtifactCache
): Promise<string> {
  const sections: string[] = [];

  // Identity header
  sections.push(
    `You are ${mind.name}. Respond as this person would.\nSquad: ${mind.squadDisplayName}`
  );

  if (mind.type === "agent") {
    // Single-file agents: load entire file as tier 1
    if (mind.artifactPaths.cognitiveOS) {
      const content = await cache.loadArtifact(mind.artifactPaths.cognitiveOS);
      if (content) sections.push(content);
    }
  } else {
    // MMOS minds: tiered loading
    // Tier 1 (always): COGNITIVE_OS + COMMUNICATION_DNA
    if (mind.artifactPaths.cognitiveOS) {
      const content = await cache.loadArtifact(mind.artifactPaths.cognitiveOS);
      if (content) sections.push(content);
    }
    if (mind.artifactPaths.communicationDNA) {
      const content = await cache.loadArtifact(
        mind.artifactPaths.communicationDNA
      );
      if (content) sections.push(content);
    }

    // Tier 2: Frameworks + Value Equation + Offer/Axiom artifacts
    if (tier >= 2) {
      if (mind.artifactPaths.frameworks) {
        const content = await cache.loadArtifact(mind.artifactPaths.frameworks);
        if (content) sections.push(content);
      }
      if (mind.artifactPaths.valueEquation) {
        const content = await cache.loadArtifact(
          mind.artifactPaths.valueEquation
        );
        if (content) sections.push(content);
      }
      // Load any additional artifacts with OFFER or AXIOM in key
      for (const [key, path] of Object.entries(mind.artifactPaths)) {
        if (!path) continue;
        const k = key.toLowerCase();
        if (
          (k.includes("offer") || k.includes("axiom")) &&
          k !== "cognitiveOS" &&
          k !== "communicationDNA" &&
          k !== "frameworks" &&
          k !== "valueEquation" &&
          k !== "antipatterns" &&
          k !== "caseLibrary"
        ) {
          const content = await cache.loadArtifact(path);
          if (content) sections.push(content);
        }
      }
    }

    // Tier 3: Antipatterns + Case Library + Heuristics
    if (tier >= 3) {
      if (mind.artifactPaths.antipatterns) {
        const content = await cache.loadArtifact(
          mind.artifactPaths.antipatterns
        );
        if (content) sections.push(content);
      }
      if (mind.artifactPaths.caseLibrary) {
        const content = await cache.loadArtifact(
          mind.artifactPaths.caseLibrary
        );
        if (content) sections.push(content);
      }
      for (const hPath of mind.heuristicPaths) {
        const content = await cache.loadArtifact(hPath);
        if (content) sections.push(content);
      }
    }
  }

  // Always append task delegation prompt
  sections.push(TASK_DELEGATION_PROMPT);

  return sections.join("\n\n---\n\n");
}

export function getTokenEstimate(
  mind: MindMetadata,
  tier: 1 | 2 | 3
): number {
  if (mind.type === "agent") {
    return mind.totalTokenEstimate;
  }

  const estimateForPath = (path: string | null): number => {
    // We don't have file sizes cached here, so use totalTokenEstimate
    // proportionally. For a rough estimate, divide total by artifact count.
    return path ? Math.round(mind.totalTokenEstimate / Math.max(Object.values(mind.artifactPaths).filter(Boolean).length, 1)) : 0;
  };

  let estimate = 0;

  // Tier 1
  estimate += estimateForPath(mind.artifactPaths.cognitiveOS);
  estimate += estimateForPath(mind.artifactPaths.communicationDNA);

  if (tier >= 2) {
    estimate += estimateForPath(mind.artifactPaths.frameworks);
    estimate += estimateForPath(mind.artifactPaths.valueEquation);
  }

  if (tier >= 3) {
    estimate += estimateForPath(mind.artifactPaths.antipatterns);
    estimate += estimateForPath(mind.artifactPaths.caseLibrary);
    estimate += mind.heuristicPaths.length * estimateForPath(mind.heuristicPaths[0] ?? null);
  }

  // Add ~200 tokens for header + task delegation prompt
  return estimate + 200;
}

export async function loadTier3Artifact(
  mind: MindMetadata,
  artifactKey: string,
  cache: ArtifactCache
): Promise<string | null> {
  const path = mind.artifactPaths[artifactKey];
  if (!path) return null;

  const content = await cache.loadArtifact(path);
  return content || null;
}

export { TASK_DELEGATION_PROMPT };
