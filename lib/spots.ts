// lib/spots.ts - Firestore Version

import {
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getUserCollectionRef, getUserId } from "./firestore";

// Kystretning - hvilken vej vender vandet?
export type CoastDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export type SpotRow = {
  id: string;          // Firestore ID
  userId: string;      // ejerskab
  name: string;
  lat: number;
  lng: number;
  notes?: string | null;
  coastDirection?: CoastDirection | null;  // Hvilken retning vender vandet?
  created_at: string;  // ISO
  updated_at: string;  // ISO
};

// Alias for backwards compatibility
export type Spot = SpotRow;

export type NewSpotInput = {
  name: string;
  lat: number;
  lng: number;
  notes?: string | null;
  coastDirection?: CoastDirection | null;
};

// Vindtype baseret på kystretning og vindretning
export type WindType = 'onshore' | 'offshore' | 'side';

// Konverter kompasretning til grader
const DIRECTION_ANGLES: Record<CoastDirection, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315
};

/**
 * Beregn vindtype baseret på vindretning og kystens retning
 * @param windDirDeg - Vindretning i grader (hvor vinden kommer FRA)
 * @param coastDir - Hvilken retning vandet vender
 * @returns 'onshore' (pålandsvind), 'offshore' (fralandsvind), eller 'side' (sidevind)
 */
export function getWindType(windDirDeg: number, coastDir: CoastDirection): WindType {
  const coastAngle = DIRECTION_ANGLES[coastDir];

  // Vindretning er hvor vinden kommer FRA
  // Pålandsvind = vind der blæser MOD kysten (fra havet)
  // Fralandsvind = vind der blæser FRA kysten (mod havet)

  // Normaliser vindretning til 0-360
  const windDir = ((windDirDeg % 360) + 360) % 360;

  // Beregn forskel mellem vindretning og kystretning
  let diff = Math.abs(windDir - coastAngle);
  if (diff > 180) diff = 360 - diff;

  // Pålandsvind: vind kommer fra samme retning som vandet vender (±45°)
  if (diff <= 45) return 'onshore';

  // Fralandsvind: vind kommer fra modsat retning (±45° fra 180°)
  if (diff >= 135) return 'offshore';

  // Sidevind: alt derimellem
  return 'side';
}

/**
 * Få dansk label for vindtype
 */
export function getWindTypeLabel(windType: WindType, language: 'da' | 'en' = 'da'): string {
  const labels = {
    da: { onshore: 'pålandsvind', offshore: 'fralandsvind', side: 'sidevind' },
    en: { onshore: 'onshore wind', offshore: 'offshore wind', side: 'side wind' }
  };
  return labels[language][windType];
}

const mapSnapshotToSpotRow = (snap: QueryDocumentSnapshot): SpotRow => {
  return { id: snap.id, ...(snap.data() as Omit<SpotRow, "id">) };
};

/** Opret et nyt spot ved en given position */
export async function createSpot(input: NewSpotInput): Promise<SpotRow> {
  const userId = getUserId();
  const nowIso = new Date().toISOString();

  const spotsRef = getUserCollectionRef("spots");

  const payload: Omit<SpotRow, "id"> = {
    userId,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    notes: input.notes ?? null,
    coastDirection: input.coastDirection ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const docRef = await addDoc(spotsRef, payload as any);
  return { id: docRef.id, ...payload };
}

/** Hent alle spots til fx liste eller kort */
export async function listSpots(): Promise<SpotRow[]> {
  const spotsRef = getUserCollectionRef("spots");
  const qs = await getDocs(query(spotsRef, orderBy("created_at", "desc")));
  return qs.docs.map(mapSnapshotToSpotRow);
}

/** Hent et enkelt spot (til detaljer/redigering) */
export async function getSpot(id: string): Promise<SpotRow | null> {
  const refDoc = doc(getUserCollectionRef("spots"), id);
  const snap = await getDoc(refDoc);
  return snap.exists() ? (mapSnapshotToSpotRow(snap as any)) : null;
}

/** Opdater navn/noter/kystretning på et spot */
export async function updateSpot(
  id: string,
  data: Partial<Pick<SpotRow, "name" | "notes" | "coastDirection">>
): Promise<void> {
  const refDoc = doc(getUserCollectionRef("spots"), id);
  const patch: Partial<SpotRow> = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  await updateDoc(refDoc, patch as any);
}

/** Slet et spot */
export async function deleteSpot(id: string): Promise<void> {
  const refDoc = doc(getUserCollectionRef("spots"), id);
  await deleteDoc(refDoc);
}
