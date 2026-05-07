export type GoalType =
  | "fish_count"
  | "fish_size"
  | "fish_weight"
  | "trip_count"
  | "hours_fished"
  | "spot_diversity"
  | "catch_rate";

export type GoalStatus = "active" | "completed" | "expired";

export type SeasonGoal = {
  id: string;
  userId: string;
  type: GoalType;
  targetValue: number;
  currentValue: number;
  seasonYear: number;
  status: GoalStatus;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
