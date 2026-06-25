import { Injectable } from '@angular/core';
import { BurpExport } from './file-handle.service';

const DB_NAME = 'bhhb-storage';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_KEY = 'last-opened-file';

export interface StoredFileSession {
  fileName: string;
  content: BurpExport;
}

@Injectable({
  providedIn: 'root'
})
export class FileSessionStorageService {

  private dbPromise: Promise<IDBDatabase> | null = null;

  async save(session: StoredFileSession): Promise<void> {
    const db = await this.openDb();
    await this.runTransaction(db, 'readwrite', (store) => {
      store.put(session, SESSION_KEY);
    });
  }

  async load(): Promise<StoredFileSession | null> {
    try {
      const db = await this.openDb();
      const session = await this.runTransaction<StoredFileSession | undefined>(db, 'readonly', (store) => {
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

  async clear(): Promise<void> {
    try {
      const db = await this.openDb();
      await this.runTransaction(db, 'readwrite', (store) => {
        store.delete(SESSION_KEY);
      });
    } catch (error) {
      console.warn('Failed to clear last opened file from storage.', error);
    }
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });

    return this.dbPromise;
  }

  private runTransaction<T = void>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
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