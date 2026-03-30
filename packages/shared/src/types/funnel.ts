export type FunnelType = "launch" | "perpetual";

export interface Funnel {
  id: string;
  projectId: string;
  name: string;
  type: FunnelType;
  metaAccountId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
  updatedAt: string;
}
