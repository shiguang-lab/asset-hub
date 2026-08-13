const DB_NAME = "shiguang-drafts";
const STORE = "drafts";

interface DraftRecord {
  key: string;
  assetId: string;
  baseVersionId: string;
  content: string;
  updatedAt: string;
  synced: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const draftKey = (subject: string, assetId: string): string => `${subject}:${assetId}`;

export async function saveDraft(record: Omit<DraftRecord, "updatedAt" | "synced">): Promise<void> {
  await withStore("readwrite", (store) =>
    store.put({
      ...record,
      updatedAt: new Date().toISOString(),
      synced: false,
    } satisfies DraftRecord),
  );
}

export async function loadDraft(subject: string, assetId: string): Promise<DraftRecord | null> {
  return withStore("readonly", (store) => store.get(draftKey(subject, assetId)));
}

export async function markSynced(
  subject: string,
  assetId: string,
  baseVersionId: string,
): Promise<void> {
  await withStore("readwrite", (store) => {
    const getReq = store.get(draftKey(subject, assetId));
    getReq.onsuccess = () => {
      const record = getReq.result as DraftRecord | undefined;
      if (record) {
        store.put({ ...record, synced: true, baseVersionId, updatedAt: new Date().toISOString() });
      }
    };
    return getReq;
  });
}

export async function clearDraft(subject: string, assetId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(draftKey(subject, assetId)));
}
