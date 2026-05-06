export interface FunnelGroupsSpreadsheetLink {
  id: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetName: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface FunnelGroupsSyncResult {
  rowsProcessed: number;
  rowsInserted: number;
  rowsUpdated: number;
  errors: string[];
}

export interface FunnelGroupsDailyPoint {
  date: string;
  participants: number;
  input: number;
  output: number;
  groupFull: number;
  groupOpen: number;
  groupTotal: number;
  clicksTotal: number;
  deltaParticipants: number;
  deltaInput: number;
  deltaOutput: number;
}

export interface FunnelGroupsCampaignSeries {
  campaignId: string;
  campaignName: string;
  series: FunnelGroupsDailyPoint[];
}

export interface FunnelGroupsKpis {
  participants: number;
  deltaParticipants: number;
  deltaInput: number;
  deltaOutput: number;
  groupFull: number;
  groupOpen: number;
  groupTotal: number;
  clicksTotal: number;
  asOf: string | null;
}

export interface FunnelGroupsDailyResponse {
  campaigns: FunnelGroupsCampaignSeries[];
  aggregate: { series: FunnelGroupsDailyPoint[] };
  kpis: FunnelGroupsKpis;
}
