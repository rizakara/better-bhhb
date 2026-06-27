import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FileHandleService } from '../file-handle/file-handle.service';

export type BurpImportStatus = 'idle' | 'loading' | 'success' | 'error';

export interface BurpImportState {
  status: BurpImportStatus;
  message: string;
  itemCount?: number;
}

const DEFAULT_PORT = 19876;
const FETCH_TIMEOUT_MS = 15000;

@Injectable({
  providedIn: 'root'
})
export class BurpImportService {
  private readonly stateSubject = new BehaviorSubject<BurpImportState>({
    status: 'idle',
    message: '',
  });

  private importStarted = false;

  constructor(private fileHandleService: FileHandleService) {}

  getStateListener() {
    return this.stateSubject.asObservable();
  }

  get currentState(): BurpImportState {
    return this.stateSubject.value;
  }

  shouldAutoImportFromUrl(): boolean {
    return this.readImportParams().importRequested;
  }

  async importFromCurrentUrl(): Promise<boolean> {
    const params = this.readImportParams();
    if (!params.importRequested) {
      return false;
    }
    await this.importFromLocalhost(params.port);
    this.clearImportParamsFromUrl();
    return true;
  }

  async importFromLocalhost(port: number = DEFAULT_PORT): Promise<void> {
    if (this.importStarted) {
      return;
    }
    this.importStarted = true;
    this.stateSubject.next({
      status: 'loading',
      message: `Fetching Burp history from localhost:${port}…`,
    });

    const dataUrl = `http://127.0.0.1:${port}/data`;
    const fetchedUrl = `http://127.0.0.1:${port}/fetched`;

    try {
      const response = await this.fetchWithTimeout(dataUrl, FETCH_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`Burp import server responded with HTTP ${response.status}.`);
      }

      const xml = await response.text();
      if (!xml.trim()) {
        throw new Error('Burp import server returned an empty XML payload.');
      }

      const itemCount = await this.fileHandleService.importBurpXml(xml, {
        source: 'burp-extension',
        rawXml: xml,
      });

      if (itemCount === null) {
        this.stateSubject.next({ status: 'idle', message: '' });
        return;
      }

      void this.notifyServerFetched(fetchedUrl);

      this.stateSubject.next({
        status: 'success',
        message: 'Burp history imported successfully',
        itemCount,
      });
    } catch (error) {
      const message = this.describeFetchError(error, port);
      console.error('Burp localhost import failed.', error);
      this.stateSubject.next({
        status: 'error',
        message,
      });
      throw new Error(message);
    } finally {
      this.importStarted = false;
    }
  }

  resetState(): void {
    this.stateSubject.next({ status: 'idle', message: '' });
  }

  private readImportParams(): { importRequested: boolean; port: number } {
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.replace(/^#\/?/, '');
    const hashParams = hash.startsWith('import')
      ? new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
      : new URLSearchParams();

    const importFlag = searchParams.get('import') ?? hashParams.get('import');
    const portValue = searchParams.get('port') ?? hashParams.get('port') ?? String(DEFAULT_PORT);
    const parsedPort = Number.parseInt(portValue, 10);

    return {
      importRequested: importFlag === '1' || hash.startsWith('import'),
      port: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT,
    };
  }

  private clearImportParamsFromUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('import');
    url.searchParams.delete('port');

    if (url.hash.startsWith('#/import') || url.hash.startsWith('#import')) {
      url.hash = '';
    }

    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        mode: 'cors',
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async notifyServerFetched(url: string): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        mode: 'cors',
      });
    } catch (error) {
      console.warn('Unable to notify Burp import server that data was fetched.', error);
    }
  }

  private describeFetchError(error: unknown, port: number): string {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return `Timed out waiting for Burp on localhost:${port}. Trigger "Send to PWA" again from Burp.`;
    }

    if (error instanceof TypeError) {
      return `Could not reach the Burp import server on localhost:${port}. It may have already stopped, or your browser blocked the request.`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Failed to import Burp history from localhost.';
  }
}