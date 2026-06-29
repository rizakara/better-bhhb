import { Injectable } from '@angular/core';
import { RowHighlightColor } from '../row-triage/row-triage.types';
import { WorkspaceViewState } from '../workspace/workspace-view-state';
import { BurpExport } from './file-handle.service';

const DB_NAME = 'bhhb-storage';
const DB_VERSION = 3;
const SESSIONS_STORE = 'sessions';
const HISTORY_STORE = 'history';
const HISTORY_CONTENT_STORE = 'history-content';
const SESSION_KEY = 'last-opened-file';

export interface StoredFileSession {
  fileName: string;
  content: BurpExport;
  requestEdits?: Record<number, string>;
  commentEdits?: Record<number, string>;
  highlightEdits?: Record<number, RowHighlightColor | null>;
  bookmarkEdits?: Record<number, boolean>;
  viewState?: WorkspaceViewState;
  label?: string;
  labelCustomized?: boolean;
}

export interface StoredHistoryMetadata {
  id: string;
  fileName: string;
  importedAt: string;
  itemCount: number;
  burpVersion: string;
  exportTime: string;
  source: 'file' | 'burp-extension';
}

export interface StoredHistoryContent {
  id: string;
  content: BurpExport;
  rawXml?: string;
}

/** Full history entry with content — returned only when opening a session. */
export interface StoredHistoryEntry extends StoredHistoryMetadata {
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
      source?: StoredHistoryMetadata['source'];
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

    const metadata = this.toHistoryMetadata(session, options);
    await this.runMultiStoreTransaction(db, [HISTORY_STORE, HISTORY_CONTENT_STORE], 'readwrite', (stores) => {
      stores[HISTORY_STORE].put(metadata);
      stores[HISTORY_CONTENT_STORE].put({
        id: metadata.id,
        content: session.content,
        rawXml: options?.rawXml,
      });
    });
    return metadata.id;
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

  async listHistory(): Promise<StoredHistoryMetadata[]> {
    try {
      const db = await this.openDb();
      await this.migrateLegacySessionIfNeeded(db);
      const entries = await this.runTransaction<StoredHistoryMetadata[]>(db, HISTORY_STORE, 'readonly', (store) => {
        return store.getAll();
      });
      return (entries ?? [])
        .filter((entry) => !!entry?.id && typeof entry.itemCount === 'number')
        .sort((left, right) => right.importedAt.localeCompare(left.importedAt));
    } catch (error) {
      console.warn('Failed to list import history from storage.', error);
      return [];
    }
  }

  async loadHistoryEntry(id: string): Promise<StoredHistoryEntry | null> {
    try {
      const db = await this.openDb();
      const metadata = await this.runTransaction<StoredHistoryMetadata | StoredHistoryEntry | undefined>(
        db,
        HISTORY_STORE,
        'readonly',
        (store) => store.get(id),
      );
      if (!metadata?.id) {
        return null;
      }

      const content = await this.runTransaction<StoredHistoryContent | undefined>(
        db,
        HISTORY_CONTENT_STORE,
        'readonly',
        (store) => store.get(id),
      );

      const resolvedContent = content?.content ?? (metadata as StoredHistoryEntry).content;
      if (!resolvedContent?.items) {
        return null;
      }

      return {
        id: metadata.id,
        fileName: metadata.fileName,
        importedAt: metadata.importedAt,
        itemCount: metadata.itemCount,
        burpVersion: metadata.burpVersion,
        exportTime: metadata.exportTime,
        source: metadata.source,
        content: resolvedContent,
        rawXml: content?.rawXml ?? (metadata as StoredHistoryEntry).rawXml,
      };
    } catch (error) {
      console.warn(`Failed to load history entry ${id} from storage.`, error);
      return null;
    }
  }

  async deleteHistoryEntry(id: string): Promise<void> {
    try {
      const db = await this.openDb();
      await this.runMultiStoreTransaction(db, [HISTORY_STORE, HISTORY_CONTENT_STORE], 'readwrite', (stores) => {
        stores[HISTORY_STORE].delete(id);
        stores[HISTORY_CONTENT_STORE].delete(id);
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

  private toHistoryMetadata(
    session: StoredFileSession,
    options?: { source?: StoredHistoryMetadata['source']; rawXml?: string }
  ): StoredHistoryMetadata {
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

    const existing = await this.runTransaction<StoredHistoryMetadata[]>(db, HISTORY_STORE, 'readonly', (store) => {
      return store.getAll();
    });
    const alreadyMigrated = (existing ?? []).some((entry) => entry.fileName === session.fileName);
    if (alreadyMigrated) {
      return;
    }

    await this.save(session, { source: 'file' });
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
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE);
        }
        if (!db.objectStoreNames.contains(HISTORY_STORE)) {
          db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(HISTORY_CONTENT_STORE)) {
          db.createObjectStore(HISTORY_CONTENT_STORE, { keyPath: 'id' });
        }

        if (event.oldVersion > 0 && event.oldVersion < 3 && transaction) {
          this.migrateHistoryContentToSeparateStore(transaction);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });

    return this.dbPromise;
  }

  private migrateHistoryContentToSeparateStore(transaction: IDBTransaction): void {
    const historyStore = transaction.objectStore(HISTORY_STORE);
    const contentStore = transaction.objectStore(HISTORY_CONTENT_STORE);
    const request = historyStore.getAll();

    request.onsuccess = () => {
      const entries = request.result as Array<StoredHistoryEntry | StoredHistoryMetadata>;
      entries.forEach((entry) => {
        if (!entry?.id) {
          return;
        }
        const legacyEntry = entry as StoredHistoryEntry;
        if (!legacyEntry.content?.items) {
          return;
        }
        contentStore.put({
          id: legacyEntry.id,
          content: legacyEntry.content,
          rawXml: legacyEntry.rawXml,
        });
        historyStore.put({
          id: legacyEntry.id,
          fileName: legacyEntry.fileName,
          importedAt: legacyEntry.importedAt,
          itemCount: legacyEntry.itemCount,
          burpVersion: legacyEntry.burpVersion,
          exportTime: legacyEntry.exportTime,
          source: legacyEntry.source,
        });
      });
    };
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
        resolve(request.result);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  }

  private runMultiStoreTransaction(
    db: IDBDatabase,
    storeNames: string[],
    mode: IDBTransactionMode,
    operation: (stores: Record<string, IDBObjectStore>) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, mode);
      const stores: Record<string, IDBObjectStore> = {};
      storeNames.forEach((name) => {
        stores[name] = transaction.objectStore(name);
      });
      operation(stores);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  }
}