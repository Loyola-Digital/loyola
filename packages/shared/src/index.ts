export type AppConfig = {
  name: string;
  version: string;
};

export const APP_NAME = "Loyola Digital X" as const;

export type {
  MindArtifactPaths,
  MindMetadata,
  MindSummary,
  MindDetail,
  Squad,
} from "./types/mind.js";
