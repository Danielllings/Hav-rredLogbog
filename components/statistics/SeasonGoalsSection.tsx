import { View, Text, Pressable, StyleSheet, Platform, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withDelay,
  runOnJS,
} from "react-native-reanimated";
import { useEffect } from "react";
import Svg, { Circle } from "react-native-svg";

import { APPLE } from "../../constants/appleTheme";
import type { SeasonGoal } from "../../types/goals";
import {
  getGoalIcon,
  getGoalLabel,
  getGoalProgressText,
  getGoalProgressPercent,
} from "../../lib/goals";

type Props = {
  goals: SeasonGoal[];
  onAddGoal: () => void;
  onDeleteGoal: (goalId: string) => void;
  year: number;
  t: (k: any) => string;
};

function ProgressRing({
  percent,
  completed,
  size = 44,
}: {
  percent: number;
  completed: boolean;
  size?: number;
}) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(percent, 1));

  const color = completed ? "#22C55E" : APPLE.accent;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={APPLE.gray1}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
        {completed ? (
          <Ionicons name="checkmark" size={18} color="#22C55E" />
        ) : (
          <Text style={styles.ringPercent}>
            {Math.round(percent * 100)}%
          </Text>
        )}
      </View>
    </View>
  );
}

function GoalCard({
  goal,
  onDelete,
  index,
  t,
}: {
  goal: SeasonGoal;
  onDelete: (id: string) => void;
  index: number;
  t: (k: any) => string;
}) {
  const isCompleted = goal.status === "completed";
  const percent = getGoalProgressPercent(goal);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isCompleted && goal.completedAt) {
      const completedAgo = Date.now() - new Date(goal.completedAt).getTime();
      if (completedAgo < 10000) {
        scale.value = withSequence(
          withDelay(index * 100, withSpring(1.05, { damping: 8 })),
          withSpring(1, { damping: 12 })
        );
      }
    }
  }, [isCompleted]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isIOS = Platform.OS === "ios";

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t("deleteGoal"),
      t("deleteGoalConfirm"),
      [
        { text: t("goalCancel"), style: "cancel" },
        { text: t("deleteGoal"), style: "destructive", onPress: () => onDelete(goal.id) },
      ]
    );
  };

  const content = (
    <View style={styles.cardRow}>
      <View style={[styles.goalIconWrap, isCompleted && styles.goalIconCompleted]}>
        <Ionicons
          name={getGoalIcon(goal.type) as any}
          size={16}
          color={isCompleted ? "#22C55E" : APPLE.accent}
        />
      </View>
      <View style={styles.cardTextCol}>
        <Text style={styles.goalLabel} numberOfLines={1}>
          {getGoalLabel(goal, t)}
        </Text>
        <Text style={[styles.goalProgress, isCompleted && styles.goalProgressDone]}>
          {isCompleted ? t("goalCompleted") : getGoalProgressText(goal)}
        </Text>
      </View>
      <ProgressRing percent={percent} completed={isCompleted} />
    </View>
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(400).springify()}
      style={animStyle}
    >
      <Pressable onLongPress={handleLongPress} delayLongPress={500}>
        <View style={styles.goalCard}>
          {content}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function SeasonGoalsSection({ goals, onAddGoal, onDeleteGoal, year, t }: Props) {
  if (goals.length === 0) {
    return (
      <Animated.View
        entering={FadeInUp.delay(250).duration(500)}
        style={styles.section}
      >
        <Text style={styles.sectionTitle}>{t("seasonGoals")}</Text>
        <View style={styles.emptyCard}>
          <Ionicons name="flag-outline" size={36} color={APPLE.textTertiary} />
          <Text style={styles.emptyText}>{t("noGoalsSet")}</Text>
          <Pressable style={styles.addButton} onPress={onAddGoal}>
            <Ionicons name="add" size={18} color="#000" />
            <Text style={styles.addButtonText}>{t("setGoals")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.delay(250).duration(500)}
      style={styles.section}
    >
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{t("seasonGoals")}</Text>
        <Pressable style={styles.addSmallBtn} onPress={onAddGoal} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={20} color={APPLE.accent} />
        </Pressable>
      </View>

      {goals.map((goal, idx) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          onDelete={onDeleteGoal}
          index={idx}
          t={t}
        />
      ))}

      <Text style={styles.hintText}>{t("goalLongPressHint")}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: APPLE.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  // Empty state
  emptyCard: {
    backgroundColor: APPLE.cardSolid,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: APPLE.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: APPLE.accent,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  addSmallBtn: {
    marginBottom: 12,
  },
  // Goal card
  goalCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    backgroundColor: APPLE.cardSolid,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  goalIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: APPLE.accentMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  goalIconCompleted: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  cardTextCol: {
    flex: 1,
  },
  goalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: APPLE.text,
  },
  goalProgress: {
    fontSize: 12,
    color: APPLE.textSecondary,
    marginTop: 2,
  },
  goalProgressDone: {
    color: "#22C55E",
    fontWeight: "600",
  },
  hintText: {
    fontSize: 11,
    color: APPLE.textTertiary,
    textAlign: "center",
    marginTop: 4,
  },
  // Progress ring
  ringCenter: {
    justifyContent: "center",
    alignItems: "center",
  },
  ringPercent: {
    fontSize: 11,
    fontWeight: "700",
    color: APPLE.text,
  },
});
