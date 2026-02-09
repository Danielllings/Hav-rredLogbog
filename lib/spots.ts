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

export type SpotRow = {
  id: string;          // Firestore ID
  userId: string;      // ejerskab
  name: string;
  lat: number;
  lng: number;
  notes?: string | null;
  created_at: string;  // ISO
  updated_at: string;  // ISO
};

export type NewSpotInput = {
  name: string;
  lat: number;
  lng: number;
  notes?: string | null;
};

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

/** Opdater navn/noter på et spot */
export async function updateSpot(
  id: string,
  data: Partial<Pick<SpotRow, "name" | "notes">>
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
