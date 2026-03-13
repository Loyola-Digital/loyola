export interface MindArtifactPaths {
  cognitiveOS: string | null;
  communicationDNA: string | null;
  frameworks: string | null;
  valueEquation: string | null;
  antipatterns: string | null;
  caseLibrary: string | null;
  [key: string]: string | null;
}

export interface MindMetadata {
  id: string;
  name: string;
  squad: string;
  squadDisplayName: string;
  type: "mind" | "agent";
  avatarUrl: string | null;
  tags: string[];
  specialty: string;
  artifactPaths: MindArtifactPaths;
  heuristicPaths: string[];
  totalTokenEstimate: number;
}

export interface MindSummary {
  id: string;
  name: string;
  squad: string;
  specialty: string;
  tags: string[];
  avatarUrl: string | null;
  totalTokenEstimate: number;
}

export interface MindDetail extends MindSummary {
  bio: string;
  frameworks: string[];
  communicationStyle: {
    tone: string;
    vocabulary: string[];
    forbiddenWords: string[];
  };
  stats: {
    artifactCount: number;
    heuristicCount: number;
    conversationCount: number;
  };
}

export interface Squad {
  id: string;
  name: string;
  displayName: string;
  description: string;
  mindCount: number;
  minds: MindSummary[];
}
