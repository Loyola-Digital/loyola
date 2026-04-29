// Snapshot data shape for instagram monthly reports (Epic 24)

export interface PostSummary {
  mediaId: string;
  mediaType: string;
  mediaProductType: string | null;
  timestamp: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  caption: string | null;
  reach: number | null;
  likes: number;
  comments: number;
  saves: number | null;
  engagementRate: number | null;
  follows: number | null;
}

export interface AccountReportTotals {
  postsPublished: number;
  reach: number;
  views: number;
  interactions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface AccountReportFollowers {
  startOfMonth: number | null;
  endOfMonth: number | null;
  gained: number;
  lost: number;
  net: number;
}

export interface AccountReportMediaDistribution {
  reels: { count: number; reach: number };
  feed: { count: number; reach: number };
}

export interface AccountReportDailyPoint {
  date: string;
  followersDelta: number;
  reach: number;
}

export interface AccountReportDemographics {
  ageGender: Array<{ key: string; value: number }> | null;
  cities: Array<{ name: string; count: number }> | null;
  countries: Array<{ name: string; count: number }> | null;
}

export interface AccountReportDeltaItem {
  current: number;
  previous: number;
  /** % delta. null quando previous = 0 (não dá pra calcular %). */
  deltaPct: number | null;
}

export interface AccountReportDelta {
  followersNet: AccountReportDeltaItem;
  reach: AccountReportDeltaItem;
  views: AccountReportDeltaItem;
  interactions: AccountReportDeltaItem;
  postsPublished: AccountReportDeltaItem;
}

export interface AccountReport {
  accountId: string;
  instagramUsername: string;
  accountName: string;
  profilePictureUrl: string | null;
  totals: AccountReportTotals;
  followers: AccountReportFollowers;
  mediaDistribution: AccountReportMediaDistribution;
  dailyTrend: AccountReportDailyPoint[];
  topByEngagement: PostSummary[];
  bottomByEngagement: PostSummary[];
  topByReach: PostSummary[];
  bottomByReach: PostSummary[];
  demographics: AccountReportDemographics | null;
  comparison: AccountReportDelta | null;
}

export interface MonthlyReportData {
  month: string; // YYYY-MM
  monthLabel: string; // "Abril 2026"
  generatedAt: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  accounts: AccountReport[];
  hasComparison: boolean;
}

export interface InstagramMonthlyReportRecord {
  id: string;
  projectId: string;
  month: string;
  data: MonthlyReportData;
  generatedBy: string;
  generatedAt: string;
}

export interface InstagramMonthlyReportListItem {
  id: string;
  month: string;
  generatedAt: string;
  generatedBy: string;
}
