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
  /** (likes + comments + saves) / reach × 100, ou null se reach indisponível */
  engagementRate: number | null;
  /** Qualidade de vídeo (Reels): plays (v25 "views"), shares e tempo médio
   * assistido (ig_reels_avg_watch_time, em ms). null p/ imagem ou sem dado. */
  views: number | null;
  shares: number | null;
  avgWatchTimeMs: number | null;
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
