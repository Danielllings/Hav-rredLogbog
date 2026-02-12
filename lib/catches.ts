// lib/catches.ts - Firestore + Storage Version
import {
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  doc,
  query,
  where,
  orderBy,
  getDoc,
  type QueryDocumentSnapshot,
  type QueryConstraint,
  collection,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getUserCollectionRef, getUserId } from "./firestore";
import { db, storage } from "./firebase";

export type CatchRow = {
  id: string;
  userId: string;
  date: string;
  time_of_day?: string | null;
  length_cm?: number | null;
  weight_kg?: number | null;
  bait?: string | null;
  notes?: string | null;
  photo_uri: string; // nu skal dette altid være en cloud-URL i databasen
  lat?: number | null;
  lng?: number | null;
  created_at: string;
  updated_at: string;
  trip_id?: string | null; // optional link to a trip
};

const mapSnapshotToCatchRow = (snap: QueryDocumentSnapshot): CatchRow => {
  return { id: snap.id, ...(snap.data() as Omit<CatchRow, "id">) };
};

// Hjælpefunktion: upload lokalt billede til Firebase Storage og få en downloadURL tilbage
async function uploadCatchPhoto(localUri: string, catchId: string) {
  // localUri kommer typisk fra ImagePicker (file:///…)
  const response = await fetch(localUri);
  const blob = await response.blob();

  // læg billeder i en mappe pr. bruger, så det kan skilles ad i Storage
  const userId = getUserId();
  const imageRef = ref(storage, `catches/${userId}/${catchId}.jpg`);

  await uploadBytes(imageRef, blob);
  const downloadUrl = await getDownloadURL(imageRef);
  return downloadUrl;
}

export async function addCatch(
  input: Omit<CatchRow, "id" | "userId" | "created_at" | "updated_at">
) {
  if (!input.photo_uri) throw new Error("Foto er påkrævet");

  const userId = getUserId();
  const now = new Date().toISOString();

  const catchesRef = getUserCollectionRef("catches");
  // Vi laver selv et id, så vi kan bruge det til filnavn i Storage
  const refDoc = doc(catchesRef);
  const catchId = refDoc.id;

  // upload billede til Storage – input.photo_uri er en LOKAL sti her
  const photoUrl = await uploadCatchPhoto(input.photo_uri, catchId);

  const payload: Omit<CatchRow, "id"> = {
    ...input,
    photo_uri: photoUrl, // vi gemmer DOWNLOAD-URL i databasen, ikke lokal sti
    userId,
    created_at: now,
    updated_at: now,
  };

  await setDoc(refDoc, payload);
  return catchId;
}

export async function updateCatch(
  id: string,
  patch: Partial<Omit<CatchRow, "id" | "userId" | "created_at">>
) {
  const now = new Date().toISOString();
  const refDoc = doc(getUserCollectionRef("catches"), id);

  const patchToSave: Partial<CatchRow> & { updated_at?: string } = { ...patch };

  // Hvis der kommer en ny photo_uri ind, så antag at det er en lokal sti,
  // medmindre det allerede er en http/https-URL.
  if (patch.photo_uri) {
    const isRemote =
      typeof patch.photo_uri === "string" &&
      (patch.photo_uri.startsWith("http://") ||
        patch.photo_uri.startsWith("https://"));

    if (!isRemote) {
      // lokal sti -> upload til Storage og erstat med downloadURL
      const photoUrl = await uploadCatchPhoto(patch.photo_uri, id);
      patchToSave.photo_uri = photoUrl;
    }
  }

  patchToSave.updated_at = now;

  await updateDoc(refDoc, patchToSave);
}

export async function deleteCatch(id: string) {
  const refDoc = doc(getUserCollectionRef("catches"), id);
  await deleteDoc(refDoc);
}

export async function listCatches(
  date?: string,
  minLength?: number
): Promise<CatchRow[]> {
  const catchesRef = getUserCollectionRef("catches");
  const constraints: QueryConstraint[] = [];

  if (minLength && minLength > 0) {
    constraints.push(where("length_cm", ">=", minLength));
  }

  if (date) {
    const startOfDay = `${date}T00:00:00.000Z`;
    const nextDayIso = new Date(
      new Date(date).getTime() + 24 * 3600 * 1000
    )
      .toISOString()
      .slice(0, 10);
    const endOfDay = `${nextDayIso}T00:00:00.000Z`;
    constraints.push(where("date", ">=", startOfDay));
    constraints.push(where("date", "<", endOfDay));
  }

  constraints.push(orderBy("date", "desc"));

  const qy = query(catchesRef, ...constraints);
  const qs = await getDocs(qy);
  return qs.docs.map(mapSnapshotToCatchRow);
}

export async function getCatch(id: string): Promise<CatchRow | null> {
  const refDoc = doc(getUserCollectionRef("catches"), id);
  const snap = await getDoc(refDoc);
  return snap.exists() ? mapSnapshotToCatchRow(snap as QueryDocumentSnapshot) : null;
}
