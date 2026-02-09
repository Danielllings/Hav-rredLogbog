// lib/storage.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import { getUserId } from "./firestore";

/**
 * Upload et fangst-billede til Firebase Storage og returnér download-URL.
 * localUri er typisk en "file://..." sti fra ImagePicker.
 */
export async function uploadCatchImageAsync(
  localUri: string,
  catchId?: string
): Promise<string> {
  const userId = getUserId();

  // Hent filen som blob via fetch
  const response = await fetch(localUri);
  const blob = await response.blob();

  // Prøv at gætte fil-endelse
  const uriParts = localUri.split("?");
  const basePath = uriParts[0] ?? localUri;
  const extMatch = basePath.split(".").pop();
  const ext = extMatch && extMatch.length <= 4 ? extMatch : "jpg";

  const filename = `${catchId ?? Date.now().toString()}.${ext}`;
  const path = `catches/${userId}/${filename}`;

  const storageRef = ref(storage, path);

  // Upload blob
  await uploadBytes(storageRef, blob);

  // Hent et offentligt (sikkerhedsstyret) download-URL
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}
