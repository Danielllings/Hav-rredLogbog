// Web shim for firebase/storage — no-op on web preview.
const noop = () => {};
export function getStorage() { return {}; }
export function ref() { return { fullPath: 'mock', name: 'mock' }; }
export function uploadBytes() { return Promise.resolve({ ref: ref(), metadata: {} }); }
export function uploadBytesResumable() { return { on: noop, cancel: noop, pause: noop, resume: noop, snapshot: { bytesTransferred: 0, totalBytes: 0 } }; }
export function getDownloadURL() { return Promise.resolve('https://placeholder.com/mock.jpg'); }
export function deleteObject() { return Promise.resolve(); }
export function listAll() { return Promise.resolve({ items: [], prefixes: [] }); }
