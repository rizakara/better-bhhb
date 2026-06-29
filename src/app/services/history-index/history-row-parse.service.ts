import { Injectable } from '@angular/core';
import {
  indexRowBodies,
  RawBurpPayload,
  RequestResponseParts,
} from './history-row-search';

export interface ParsedRowParts {
  request: RequestResponseParts;
  response: RequestResponseParts;
  title: string;
  bodySearchText: string;
}

@Injectable({ providedIn: 'root' })
export class HistoryRowParseService {
  private readonly cache = new Map<number, ParsedRowParts>();

  clear(): void {
    this.cache.clear();
  }

  has(position: number): boolean {
    return this.cache.has(position);
  }

  get(position: number): ParsedRowParts | undefined {
    return this.cache.get(position);
  }

  getOrParse(
    position: number,
    rawRequest: RawBurpPayload | undefined,
    rawResponse: RawBurpPayload | undefined,
  ): ParsedRowParts {
    const cached = this.cache.get(position);
    if (cached) {
      return cached;
    }

    const parsed = indexRowBodies(
      rawRequest ?? { base64: false, content: '' },
      rawResponse ?? { base64: false, content: '' },
    );
    this.cache.set(position, parsed);
    return parsed;
  }

  setRequest(position: number, request: RequestResponseParts): void {
    const cached = this.cache.get(position);
    if (cached) {
      cached.request = request;
    }
  }

  setParsed(position: number, parsed: ParsedRowParts): void {
    this.cache.set(position, parsed);
  }

  attachToRow(row: {
    position: number;
    request?: RequestResponseParts;
    response?: RequestResponseParts;
    title?: string;
  }): boolean {
    const cached = this.cache.get(row.position);
    if (!cached) {
      return false;
    }

    row.request = cached.request;
    row.response = cached.response;
    if (!row.title && cached.title) {
      row.title = cached.title;
    }
    return true;
  }
}