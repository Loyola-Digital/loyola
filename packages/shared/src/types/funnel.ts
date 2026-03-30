export type FunnelType = "launch" | "perpetual";

export interface FunnelCampaign {
  id: string;
  name: string;
}

export interface Funnel {
  id: string;
  projectId: string;
  name: string;
  type: FunnelType;
  metaAccountId: string | null;
  campaigns: FunnelCampaign[];
  createdAt: string;
  updatedAt: string;
}
