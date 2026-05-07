import {
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getUserCollectionRef, getUserId } from "./firestore";
import type { SeasonGoal, GoalType } from "../types/goals";
import type { TripRow } from "./trips";
import type { CatchRow } from "./catches";
import type { SpotRow } from "./spots";

const mapSnapshotToGoal = (snap: QueryDocumentSnapshot): SeasonGoal => {
  return { id: snap.id, ...(snap.data() as Omit<SeasonGoal, "id">) };
};

export async function listGoals(seasonYear?: number): Promise<SeasonGoal[]> {
  const ref = getUserCollectionRef("goals");
  const constraints = seasonYear
    ? [where("seasonYear", "==", seasonYear)]
    : [];
  const snap = await getDocs(query(ref, ...constraints));
  return snap.docs.map(mapSnapshotToGoal);
}

export async function createGoal(
  input: Pick<SeasonGoal, "type" | "targetValue" | "seasonYear">
): Promise<string> {
  const userId = getUserId();
  const now = new Date().toISOString();

  // Validate no duplicate type for same season
  const existing = await listGoals(input.seasonYear);
  if (existing.some((g) => g.type === input.type)) {
    throw new Error(`Goal of type "${input.type}" already exists for ${input.seasonYear}`);
  }

  const ref = getUserCollectionRef("goals");
  const docRef = await addDoc(ref, {
    userId,
    type: input.type,
    targetValue: input.targetValue,
    currentValue: 0,
    seasonYear: input.seasonYear,
    status: "active",
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function updateGoalDoc(
  id: string,
  patch: Partial<Pick<SeasonGoal, "targetValue" | "status" | "completedAt" | "currentValue">>
): Promise<void> {
  const ref = getUserCollectionRef("goals");
  await updateDoc(doc(ref, id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteGoal(id: string): Promise<void> {
  const ref = getUserCollectionRef("goals");
  await deleteDoc(doc(ref, id));
}

// --- Progress computation (pure function) ---

type TripStats = {
  trips?: number;
  total_fish?: number;
  total_sec?: number;
  fangstrate?: number;
};

export function computeGoalProgress(
  goal: SeasonGoal,
  stats: TripStats,
  trips: TripRow[],
  catches: CatchRow[],
  _spots: SpotRow[]
): number {
  const yearTrips = trips.filter(
    (tr) => new Date(tr.start_ts).getFullYear() === goal.seasonYear
  );
  const yearCatches = catches.filter(
    (c) => new Date(c.date).getFullYear() === goal.seasonYear
  );

  switch (goal.type) {
    case "fish_count":
      return stats.total_fish ?? 0;

    case "fish_size": {
      const lengths = yearCatches
        .map((c) => c.length_cm)
        .filter((v): v is number => v != null && v > 0);
      return lengths.length > 0 ? Math.max(...lengths) : 0;
    }

    case "fish_weight": {
      const weights = yearCatches
        .map((c) => c.weight_kg)
        .filter((v): v is number => v != null && v > 0);
      return weights.length > 0 ? Math.max(...weights) : 0;
    }

    case "trip_count":
      return stats.trips ?? 0;

    case "hours_fished":
      return Math.round((stats.total_sec ?? 0) / 3600);

    case "spot_diversity": {
      const uniqueSpots = new Set(
        yearTrips
          .map((tr) => tr.spot_id)
          .filter((id): id is string => id != null)
      );
      return uniqueSpots.size;
    }

    case "catch_rate":
      return stats.fangstrate ?? 0;

    default:
      return 0;
  }
}

export function isGoalCompleted(goal: SeasonGoal): boolean {
  if (goal.type === "fish_size" || goal.type === "fish_weight") {
    return goal.currentValue >= goal.targetValue;
  }
  if (goal.type === "catch_rate") {
    return goal.currentValue >= goal.targetValue;
  }
  return goal.currentValue >= goal.targetValue;
}

// --- Labels ---

const GOAL_ICONS: Record<GoalType, string> = {
  fish_count: "fish-outline",
  fish_size: "resize-outline",
  fish_weight: "barbell-outline",
  trip_count: "navigate-outline",
  hours_fished: "time-outline",
  spot_diversity: "location-outline",
  catch_rate: "analytics-outline",
};

export function getGoalIcon(type: GoalType): string {
  return GOAL_ICONS[type];
}

export function getGoalLabel(
  goal: SeasonGoal,
  t: (k: any) => string
): string {
  switch (goal.type) {
    case "fish_count":
      return `${goal.targetValue} ${t("goalFishCountLabel")}`;
    case "fish_size":
      return `${t("goalFishSizeLabel")} ${goal.targetValue} cm`;
    case "fish_weight":
      return `${t("goalFishWeightLabel")} ${goal.targetValue} kg`;
    case "trip_count":
      return `${goal.targetValue} ${t("goalTripCountLabel")}`;
    case "hours_fished":
      return `${t("goalHoursFishedLabel")} ${goal.targetValue}${t("hourShort")}`;
    case "spot_diversity":
      return `${t("goalSpotDiversityLabel")} ${goal.targetValue} spots`;
    case "catch_rate":
      return `${t("goalCatchRateLabel")} ${goal.targetValue}%`;
    default:
      return "";
  }
}

export function getGoalProgressText(goal: SeasonGoal): string {
  if (goal.type === "fish_size") {
    return `${goal.currentValue} / ${goal.targetValue} cm`;
  }
  if (goal.type === "fish_weight") {
    return `${goal.currentValue} / ${goal.targetValue} kg`;
  }
  if (goal.type === "catch_rate") {
    return `${goal.currentValue}% / ${goal.targetValue}%`;
  }
  if (goal.type === "hours_fished") {
    return `${goal.currentValue} / ${goal.targetValue}t`;
  }
  return `${goal.currentValue} / ${goal.targetValue}`;
}

export function getGoalProgressPercent(goal: SeasonGoal): number {
  if (goal.targetValue <= 0) return 0;
  return Math.min(1, goal.currentValue / goal.targetValue);
}
