/**
 * Contribution points. Kept in a client-safe module so the Stats screen and
 * the server compute with the exact same numbers.
 *
 * Points are deliberately derived from what a member actually did, never from
 * a capped "credibility" percentage: a first sighting is worth the most, every
 * independent confirmation keeps the map trustworthy, and a photo makes a bin
 * recognisable.
 */
export const POINT_RULES = {
  /** A report that created a bin nobody had mapped yet. */
  newBin: 20,
  /** A sighting on a bin that already existed (confirmation / review). */
  confirmation: 5,
  /** Extra for attaching a photo to a sighting. */
  photo: 3,
} as const;

export type PointBreakdown = {
  newBins: number;
  confirmations: number;
  photos: number;
};

export type LeaderboardRow = {
  name: string;
  points: number;
  rank: number;
  isYou: boolean;
};

export type PublicLeaderboard = {
  rows: LeaderboardRow[];
  /** Members who explicitly agreed to appear on the public board. */
  total: number;
};

export type ContributionStats = {
  reportsCount: number;
  binsContributed: number;
  points: number;
  /** 1-based position, or null until the member contributes. */
  rank: number | null;
  totalContributors: number;
  /** Whether this member is visible on the public top 10. */
  leaderboardOptIn: boolean;
  /** Points needed to overtake the next member (null at #1). */
  pointsToNextRank: number | null;
  breakdown: PointBreakdown;
  leaderboard: LeaderboardRow[];
};
