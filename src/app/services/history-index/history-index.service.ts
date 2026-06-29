import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Base64 } from 'js-base64';
import { BehaviorSubject, Subject } from 'rxjs';
import {
  INDEX_BATCH_SIZE,
  IndexableRowPayload,
  IndexedRowResult,
  IndexingState,
  indexRowBodies,
  setDecodeBase64Impl,
} from './history-index.types';

export type { IndexingState } from './history-index.types';

const INITIAL_STATE: IndexingState = {
  indexed: 0,
  total: 0,
  complete: true,
};

@Injectable({ providedIn: 'root' })
export class HistoryIndexService implements OnDestroy {
  private readonly stateSubject = new BehaviorSubject<IndexingState>(INITIAL_STATE);
  private readonly batchResultsSubject = new Subject<IndexedRowResult[]>();
  private worker: Worker | null = null;
  private pendingBatches: IndexableRowPayload[][] = [];
  private activeBatchId = 0;
  private nextBatchId = 0;
  private cancelled = false;
  private useWorker: boolean;

  readonly state$ = this.stateSubject.asObservable();
  readonly batchResults$ = this.batchResultsSubject.asObservable();

  constructor(private readonly ngZone: NgZone) {
    setDecodeBase64Impl((value) => Base64.decode(value));
    this.useWorker = typeof Worker !== 'undefined';
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  startIndexing(rows: Array<{
    position: number;
    rawRequestPayload?: IndexableRowPayload['rawRequest'];
    rawResponsePayload?: IndexableRowPayload['rawResponse'];
  }>): void {
    this.cancel();

    const payloads: IndexableRowPayload[] = rows.map((row) => ({
      position: row.position,
      rawRequest: row.rawRequestPayload ?? { base64: false, content: '' },
      rawResponse: row.rawResponsePayload ?? { base64: false, content: '' },
    }));

    if (payloads.length === 0) {
      this.stateSubject.next(INITIAL_STATE);
      return;
    }

    this.cancelled = false;
    this.pendingBatches = this.chunk(payloads, INDEX_BATCH_SIZE);
    this.stateSubject.next({
      indexed: 0,
      total: payloads.length,
      complete: false,
    });

    if (this.useWorker) {
      this.ensureWorker();
      this.dispatchNextBatch();
      return;
    }

    this.runMainThreadFallback();
  }

  cancel(): void {
    this.cancelled = true;
    this.pendingBatches = [];
    this.activeBatchId = 0;
    this.terminateWorker();
    this.stateSubject.next(INITIAL_STATE);
  }

  private ensureWorker(): void {
    if (this.worker) {
      return;
    }

    this.worker = new Worker(
      new URL('./history-index.worker', import.meta.url),
      { type: 'module' },
    );

    this.worker.onmessage = ({ data }) => {
      if (!data || data.type !== 'batchComplete' || data.batchId !== this.activeBatchId) {
        return;
      }

      this.ngZone.run(() => {
        this.handleBatchComplete(data.results as IndexedRowResult[]);
      });
    };

    this.worker.onerror = () => {
      this.ngZone.run(() => {
        this.fallbackToMainThread();
      });
    };
  }

  private terminateWorker(): void {
    if (!this.worker) {
      return;
    }
    this.worker.terminate();
    this.worker = null;
  }

  private dispatchNextBatch(): void {
    if (this.cancelled || this.pendingBatches.length === 0) {
      if (!this.cancelled) {
        this.finishIndexing();
      }
      return;
    }

    const batch = this.pendingBatches.shift()!;
    this.activeBatchId = ++this.nextBatchId;
    this.worker?.postMessage({
      type: 'index',
      batchId: this.activeBatchId,
      batch,
    });
  }

  private handleBatchComplete(results: IndexedRowResult[]): void {
    if (this.cancelled) {
      return;
    }

    this.batchResultsSubject.next(results);

    const current = this.stateSubject.value;
    this.stateSubject.next({
      ...current,
      indexed: Math.min(current.total, current.indexed + results.length),
    });

    if (this.worker) {
      this.dispatchNextBatch();
      return;
    }

    this.scheduleMainThreadBatch();
  }

  private finishIndexing(): void {
    const current = this.stateSubject.value;
    this.stateSubject.next({
      indexed: current.total,
      total: current.total,
      complete: true,
    });
    this.terminateWorker();
  }

  private fallbackToMainThread(): void {
    this.terminateWorker();
    this.useWorker = false;
    this.runMainThreadFallback();
  }

  private runMainThreadFallback(): void {
    if (this.cancelled || this.pendingBatches.length === 0) {
      if (!this.cancelled) {
        this.finishIndexing();
      }
      return;
    }

    this.scheduleMainThreadBatch();
  }

  private scheduleMainThreadBatch(): void {
    const runBatch = () => {
      if (this.cancelled) {
        return;
      }

      const batch = this.pendingBatches.shift();
      if (!batch) {
        this.finishIndexing();
        return;
      }

      const results = batch.map((row) => {
        const indexed = indexRowBodies(row.rawRequest, row.rawResponse);
        return {
          position: row.position,
          bodySearchText: indexed.bodySearchText,
          title: indexed.title,
          request: indexed.request,
          response: indexed.response,
        };
      });

      this.handleBatchComplete(results);
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runBatch, { timeout: 50 });
      return;
    }

    setTimeout(runBatch, 0);
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      batches.push(items.slice(index, index + size));
    }
    return batches;
  }
}