export type OrganicPostSource = "youtube" | "instagram";

export interface StageOrganicPost {
  id: string;
  stageId: string;
  projectId: string;
  source: OrganicPostSource;
  externalId: string;
  createdBy: string;
  createdAt: string;
}

export interface YouTubeOrganicMetrics {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  watchTimeMinutes: number | null;
  avgRetention: number | null;
}

export interface InstagramOrganicMetrics {
  reach: number | null;
  impressions: number | null;
  likeCount: number | null;
  commentCount: number | null;
  saved: number | null;
}

export type OrganicPostMetrics = YouTubeOrganicMetrics | InstagramOrganicMetrics;

export interface OrganicPostHydration {
  isStale: boolean;
  title: string | null;
  thumbnailUrl: string | null;
  externalUrl: string;
  metrics: OrganicPostMetrics;
}

export interface StageOrganicPostHydrated extends StageOrganicPost {
  hydration: OrganicPostHydration | null;
}

export interface OrganicPostLinksMap {
  externalId: string;
  stageIds: string[];
}
