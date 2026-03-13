/**
 * CatchHeroPhoto - Hero foto-sektion til fangst-skærme
 * Stor rounded foto med placeholder hvis tom
 */

import React from "react";
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { APPLE } from "../../constants/appleTheme";
import { useLanguage } from "../../lib/i18n";

interface CatchHeroPhotoProps {
  photoUri?: string | null;
  onPickPhoto: () => void;
  showEditButton?: boolean;
  dateBadge?: string;
}

export function CatchHeroPhoto({
  photoUri,
  onPickPhoto,
  showEditButton = true,
  dateBadge,
}: CatchHeroPhotoProps) {
  const { t } = useLanguage();

  if (photoUri) {
    return (
      <Animated.View
        entering={FadeIn.duration(400)}
        style={styles.container}
      >
        <Image source={{ uri: photoUri }} style={styles.image} />

        {/* Dato badge */}
        {dateBadge && (
          <View style={styles.dateBadge}>
            <Ionicons name="calendar-outline" size={14} color={APPLE.text} />
            <Text style={styles.dateBadgeText}>{dateBadge}</Text>
          </View>
        )}

        {/* Skift foto knap */}
        {showEditButton && (
          <Pressable style={styles.changePhotoBtn} onPress={onPickPhoto}>
            <Ionicons name="image" size={16} color={APPLE.bg} />
            <Text style={styles.changePhotoBtnText}>{t("changePhoto")}</Text>
          </Pressable>
        )}
      </Animated.View>
    );
  }

  // Tom tilstand - vis placeholder
  return (
    <Animated.View entering={FadeInUp.duration(500).springify()}>
      <Pressable style={styles.emptyContainer} onPress={onPickPhoto}>
        <View style={styles.iconCircle}>
          <Ionicons name="camera" size={36} color={APPLE.accent} />
        </View>
        <Text style={styles.emptyTitle}>{t("addPhoto")}</Text>
        <Text style={styles.emptySubtitle}>{t("selectPhotoDesc")}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: APPLE.cardSolid,
    marginBottom: 16,
    position: "relative",
  },
  image: {
    width: "100%",
    height: 280,
  },
  dateBadge: {
    position: "absolute",
    left: 16,
    bottom: 16,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateBadgeText: {
    color: APPLE.text,
    fontWeight: "700",
    fontSize: 14,
  },
  changePhotoBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: APPLE.accent,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  changePhotoBtnText: {
    color: APPLE.bg,
    fontWeight: "600",
    fontSize: 14,
  },
  emptyContainer: {
    borderRadius: 24,
    backgroundColor: APPLE.cardSolid,
    marginBottom: 16,
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: APPLE.glassBorder,
    borderStyle: "dashed",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: APPLE.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: APPLE.text,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptySubtitle: {
    color: APPLE.textSecondary,
    fontSize: 14,
  },
});
