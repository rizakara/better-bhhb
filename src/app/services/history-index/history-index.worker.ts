/// <reference lib="webworker" />

import { indexRowBodySearch, setDecodeBase64Impl } from './history-row-search';
import type { IndexableRowPayload, IndexedRowResult } from './history-index.types';

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

setDecodeBase64Impl(decodeBase64);

addEventListener('message', ({ data }) => {
  if (!data || data.type !== 'index') {
    return;
  }

  const batch = data.batch as IndexableRowPayload[];
  const batchId = data.batchId as number;
  const results: IndexedRowResult[] = batch.map((row) => {
    const indexed = indexRowBodySearch(row.rawRequest, row.rawResponse);
    return {
      position: row.position,
      bodySearchText: indexed.bodySearchText,
      title: indexed.title,
    };
  });

  postMessage({ type: 'batchComplete', batchId, results });
});