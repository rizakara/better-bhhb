import { Injectable } from '@angular/core';
import { BurpExport } from './file-handle.service';

const DB_NAME = 'bhhb-storage';
const DB_VERSION = 2;
const SESSIONS_STORE = 'sessions';
const HISTORY_STORE = 'history';
const SESSION_KEY = 'last-opened-file';

export interface StoredFileSession {
  fileName: string;
  content: BurpExport;
}

export interface StoredHistoryEntry {
  id: string;
  fileName: string;
  importedAt: string;
  itemCount: number;
  burpVersion: string;
  exportTime: string;
  source: 'file' | 'burp-extension';
  content: BurpExport;
  rawXml?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FileSessionStorageService {

  private dbPromise: Promise<IDBDatabase> | null = null;

  async save(
    session: StoredFileSession,
    options?: {
      source?: StoredHistoryEntry['source'];
      rawXml?: string;
      recordHistory?: boolean;
    }
  ): Promise<string | null> {
    const db = await this.openDb();
    await this.runTransaction(db, SESSIONS_STORE, 'readwrite', (store) => {
      store.put(session, SESSION_KEY);
    });

    if (options?.recordHistory === false) {
      return null;
    }

    const entry = this.toHistoryEntry(session, options);
    await this.runTransaction(db, HISTORY_STORE, 'readwrite', (store) => {
      store.put(entry);
    });
    return entry.id;
  }

  async load(): Promise<StoredFileSession | null> {
    try {
      const db = await this.openDb();
      const session = await this.runTransaction<StoredFileSession | undefined>(db, SESSIONS_STORE, 'readonly', (store) => {
        return store.get(SESSION_KEY);
      });
      if (!session?.fileName || !session.content?.items) {
        return null;
      }
      return session;
    } catch (error) {
      console.warn('Failed to load last opened file from storage.', error);
      return null;
    }
  }

  async listHistory(): Promise<StoredHistoryEntry[]> {
    try {
      const db = await this.openDb();
      await this.migrateLegacySessionIfNeeded(db);
      const entries = await this.runTransaction<StoredHistoryEntry[]>(db, HISTORY_STORE, 'readonly', (store) => {
        return store.getAll();
      });
      return (entries ?? [])
        .filter((entry) => !!entry?.id && !!entry?.content?.items)
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
    } catch (error) {
      console.warn('Failed to list import history from storage.', error);
      return [];
    }
  }

  async loadHistoryEntry(id: string): Promise<StoredHistoryEntry | null> {
    try {
      const db = await this.openDb();
      const entry = await this.runTransaction<StoredHistoryEntry | undefined>(db, HISTORY_STORE, 'readonly', (store) => {
        return store.get(id);
      });
      if (!entry?.id || !entry.content?.items) {
        return null;
      }
      return entry;
    } catch (error) {
      console.warn(`Failed to load history entry ${id} from storage.`, error);
      return null;
    }
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    try {
      const db = await this.openDb();
      await this.runTransaction(db, HISTORY_STORE, 'readwrite', (store) => {
        store.delete(id);
      });
    } catch (error) {
      console.warn(`Failed to delete history entry ${id} from storage.`, error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.openDb();
      await this.runTransaction(db, SESSIONS_STORE, 'readwrite', (store) => {
        store.delete(SESSION_KEY);
      });
    } catch (error) {
      console.warn('Failed to clear last opened file from storage.', error);
    }
  }

  private toHistoryEntry(
    session: StoredFileSession,
    options?: { source?: StoredHistoryEntry['source']; rawXml?: string }
  ): StoredHistoryEntry {
    const items = this.normalizeItems(session.content.items.item);
    const metadata = session.content.items.$ ?? {
      burpVersion: 'unknown',
      exportTime: new Date().toISOString(),
    };

    return {
      id: this.createHistoryId(),
      fileName: session.fileName,
      importedAt: new Date().toISOString(),
      itemCount: items.length,
      burpVersion: metadata.burpVersion,
      exportTime: metadata.exportTime,
      source: options?.source ?? 'file',
      content: session.content,
      rawXml: options?.rawXml,
    };
  }

  private normalizeItems(items: object[] | object | undefined): object[] {
    if (!items) {
      return [];
    }
    return Array.isArray(items) ? items : [items];
  }

  private async migrateLegacySessionIfNeeded(db: IDBDatabase): Promise<void> {
    const session = await this.runTransaction<StoredFileSession | undefined>(db, SESSIONS_STORE, 'readonly', (store) => {
      return store.get(SESSION_KEY);
    });
    if (!session?.fileName || !session.content?.items) {
      return;
    }

    const existing = await this.runTransaction<StoredHistoryEntry[]>(db, HISTORY_STORE, 'readonly', (store) => {
      return store.getAll();
    });
    const alreadyMigrated = (existing ?? []).some((entry) => entry.fileName === session.fileName);
    if (alreadyMigrated) {
      return;
    }

    const entry = this.toHistoryEntry(session, { source: 'file' });
    await this.runTransaction(db, HISTORY_STORE, 'readwrite', (store) => {
      store.put(entry);
    });
  }

  private createHistoryId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE);
        }
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });

    return this.dbPromise;
  }

  private runTransaction<T = void>(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      transaction.oncomplete = () => {
        if (!request) {
          resolve(undefined as unknown as T);
          return;
        }
        resolve((request as IDBRequest<T>).result);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  }
}