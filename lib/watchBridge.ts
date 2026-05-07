import { Platform } from "react-native";
import type { WatchTripStatus, WatchCatchEvent } from "../types/watch";

let watchModule: any = null;

async function getWatchModule() {
  if (Platform.OS !== "ios") return null;
  if (watchModule) return watchModule;
  try {
    watchModule = require("react-native-watch-connectivity");
    return watchModule;
  } catch {
    return null;
  }
}

export async function sendTripStatusToWatch(status: WatchTripStatus): Promise<void> {
  const mod = await getWatchModule();
  if (!mod) return;
  try {
    mod.updateApplicationContext(status);
  } catch {}
}

export function onWatchCatchEvent(
  callback: (event: WatchCatchEvent) => void
): () => void {
  if (Platform.OS !== "ios") return () => {};
  try {
    const mod = require("react-native-watch-connectivity");
    const subscription = mod.watchEvents?.addListener?.("message", (msg: any) => {
      if (msg?.type === "fish_caught") {
        callback({
          ts: msg.ts || Date.now(),
          condition: msg.condition,
        });
      }
    });
    return () => subscription?.remove?.();
  } catch {
    return () => {};
  }
}

export async function isWatchPaired(): Promise<boolean> {
  const mod = await getWatchModule();
  if (!mod) return false;
  try {
    return await mod.getIsPaired();
  } catch {
    return false;
  }
}

export async function isWatchReachable(): Promise<boolean> {
  const mod = await getWatchModule();
  if (!mod) return false;
  try {
    return await mod.getIsWatchAppInstalled();
  } catch {
    return false;
  }
}
