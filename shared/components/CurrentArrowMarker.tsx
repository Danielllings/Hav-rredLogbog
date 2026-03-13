// shared/components/CurrentArrowMarker.tsx
// Arrow marker optimized for performance

import React, { memo } from "react";
import { View, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { getCurrentSpeedColor, type CurrentCell } from "../../lib/dmiGridData";

interface Props {
  cell: CurrentCell;
  tracksViewChanges?: boolean;
}

function Arrow({ cell, tracksViewChanges = false }: Props) {
  const color = getCurrentSpeedColor(cell.speed);

  return (
    <Marker
      coordinate={{ latitude: cell.lat, longitude: cell.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
    >
      <View
        style={[styles.container, { transform: [{ rotate: `${cell.direction}deg` }] }]}
        collapsable={false}
      >
        <View style={[styles.triangle, { borderBottomColor: color }]} />
        <View style={[styles.stem, { backgroundColor: color }]} />
      </View>
    </Marker>
  );
}

export const CurrentArrowMarker = memo(Arrow);

const styles = StyleSheet.create({
  container: {
    width: 10,
    height: 18,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#22C55E",
  },
  stem: {
    width: 2,
    height: 10,
    backgroundColor: "#22C55E",
    marginTop: -1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
});

export default CurrentArrowMarker;
