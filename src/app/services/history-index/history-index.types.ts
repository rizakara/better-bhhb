export type { RawBurpPayload, RequestResponseParts } from './history-row-search';
export {
  buildBodySearchIndex,
  buildMetadataSearchIndex,
  decodeBurpPayload,
  extractRawPayload,
  extractTitleFromHttpResponse,
  indexRowBodies,
  setDecodeBase64Impl,
  splitHeaderBody,
} from './history-row-search';

export interface IndexingState {
  indexed: number;
  total: number;
  complete: boolean;
}

export interface IndexableRowPayload {
  position: number;
  rawRequest: import('./history-row-search').RawBurpPayload;
  rawResponse: import('./history-row-search').RawBurpPayload;
}

export interface IndexedRowResult {
  position: number;
  bodySearchText: string;
  title: string;
  request: import('./history-row-search').RequestResponseParts;
  response: import('./history-row-search').RequestResponseParts;
}

export const INDEX_BATCH_SIZE = 300;