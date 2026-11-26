import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '../firebase';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MB

export function uploadCoverImageToStorage(
  uid: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      reject(new Error('Please select a JPEG, PNG, or WebP cover image.'));
      return;
    }

    if (file.size > MAX_COVER_BYTES) {
      reject(new Error('Cover image must be 5 MB or smaller.'));
      return;
    }

    const ext =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'author';
    const storagePath = `covers/${cleanUid}/cover_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const storageRef = ref(storage, storagePath);

    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      cacheControl: 'public,max-age=31536000',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (err) => {
        const msg = err instanceof Error ? err.message : 'Cover upload failed.';
        if (msg.includes('storage/unauthorized')) {
          reject(
            new Error(
              'Firebase Storage upload permission denied. Check your Firebase Storage rules for covers/{uid}/ or use a cover preset.'
            )
          );
          return;
        }
        reject(new Error(msg));
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(
            err instanceof Error ? err : new Error('Unable to obtain uploaded cover URL.')
          );
        }
      }
    );
  });
}
