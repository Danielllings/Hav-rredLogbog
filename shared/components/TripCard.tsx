import React, { memo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../../constants/theme";
import { fmtTime, getTripTitleParts, type TranslateFn } from "../utils/formatters";

type TripData = {
  id: string;
  start_ts?: string;
  spot_name?: string;
  distance_m: number;
  duration_sec: number;
  fish_count: number;
};

interface TripCardProps {
  trip: TripData;
  t: TranslateFn;
}

function TripTitle({ trip, t }: { trip: TripData; t?: TranslateFn }) {
  const { dateStr, spotName } = getTripTitleParts(trip, t);
  return (
    <View style={styles.tripTitleRow}>
      {spotName ? (
        <View style={styles.tripLocationRow}>
          <Ionicons name="navigate-outline" size={14} color="#FFF" />
          <Text style={styles.tripSpot} numberOfLines={1} ellipsizeMode="tail">
            {spotName}
          </Text>
        </View>
      ) : null}
      <View style={styles.tripDateRow}>
        <Ionicons name="calendar-outline" size={14} color={THEME.textSec} />
        <Text style={styles.tripDate} numberOfLines={1}>
          {dateStr}
        </Text>
      </View>
    </View>
  );
}

function TripCardComponent({ trip, t }: TripCardProps) {
  return (
    <Link href={`/trips/${trip.id}`} asChild>
      <Pressable style={styles.tripCard}>
        <View style={styles.tripCardInner}>
          <View style={styles.tripIcon}>
            <Ionicons name="location" size={20} color={THEME.primary} />
          </View>
          <View style={styles.tripContent}>
            <TripTitle trip={trip} t={t} />
            <Text style={styles.tripSub} numberOfLines={1} ellipsizeMode="tail">
              {(trip.distance_m / 1000).toFixed(2)} km • {fmtTime(trip.duration_sec)}
            </Text>
            <View style={styles.tripBadge}>
              {trip.fish_count > 0 ? (
                <>
                  <Ionicons name="fish" size={14} color={THEME.bg} />
                  <Text style={[styles.tripBadgeText, { color: THEME.bg }]}>
                    {trip.fish_count}
                  </Text>
                </>
              ) : (
                <Text style={[styles.tripBadgeText, { color: "#000" }]}>
                  {t("noFish")}
                </Text>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

// Memoize to prevent unnecessary re-renders
export const TripCard = memo(TripCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.trip.id === nextProps.trip.id &&
    prevProps.trip.fish_count === nextProps.trip.fish_count &&
    prevProps.trip.distance_m === nextProps.trip.distance_m &&
    prevProps.trip.duration_sec === nextProps.trip.duration_sec
  );
});

const styles = StyleSheet.create({
  tripCard: {
    backgroundColor: THEME.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  tripCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
  },
  tripIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  tripContent: {
    flex: 1,
    minWidth: 0,
  },
  tripTitleRow: {
    gap: 4,
  },
  tripLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripSpot: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  tripDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripDate: {
    color: THEME.textSec,
    fontSize: 13,
  },
  tripSub: {
    color: THEME.textSec,
    fontSize: 13,
    marginTop: 4,
  },
  tripBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME.graphYellow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  tripBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
