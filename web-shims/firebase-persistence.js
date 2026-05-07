// Web shim: replaces getReactNativePersistence with browser persistence on web.
// This file is only used when running `expo start --web` via Metro resolver.
import { browserLocalPersistence } from "firebase/auth";

export function getReactNativePersistence() {
  return browserLocalPersistence;
}
