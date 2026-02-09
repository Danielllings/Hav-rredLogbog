// lib/firestore.ts
import { collection, type CollectionReference, type DocumentData } from "firebase/firestore";
import { auth, db } from "./firebase";

/** Aktuel bruger-ID (kræver at brugeren er logget ind) */
export function getUserId(): string {
  const user = auth.currentUser;
  if (!user) throw new Error("Bruger er ikke logget ind. Kan ikke tilgå database.");
  return user.uid;
}

/**
 * Reference til en bruger-scope't collection:
 * /users/{uid}/{collectionName}
 *
 * Eksempler:
 *  getUserCollectionRef("trips")   -> /users/{uid}/trips
 *  getUserCollectionRef("catches") -> /users/{uid}/catches
 */
export function getUserCollectionRef(collectionName: string): CollectionReference<DocumentData> {
  const userId = getUserId();
  // VIGTIGT: ingen ekstra "data" her – ellers får vi 4 segmenter
  return collection(db, "users", userId, collectionName);
}
