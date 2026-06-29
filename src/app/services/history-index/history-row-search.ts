export interface RawBurpPayload {
  base64: boolean;
  content: string;
}

export type HeaderEntry = [string, string];
export type RequestResponseParts = [HeaderEntry[], string];

export interface MetadataSearchFields {
  position?: number | string;
  ip?: unknown;
  host?: unknown;
  port?: unknown;
  protocol?: unknown;
  method?: unknown;
  status?: unknown;
  path?: unknown;
  responselength?: unknown;
  comment?: unknown;
  url?: unknown;
  time?: unknown;
  mimetype?: unknown;
  extension?: unknown;
  title?: unknown;
}

const METADATA_SEARCH_KEYS: Array<keyof MetadataSearchFields> = [
  'position',
  'ip',
  'host',
  'port',
  'protocol',
  'method',
  'status',
  'path',
  'responselength',
  'comment',
  'url',
  'time',
  'mimetype',
  'extension',
  'title',
];

export function extractRawPayload(query: unknown): RawBurpPayload {
  try {
    const nodes = query as Array<{ $?: { base64?: string }; _?: string }> | undefined;
    const node = nodes?.[0];
    return {
      base64: node?.$?.base64 === 'true',
      content: node?._ ?? '',
    };
  } catch {
    return { base64: false, content: '' };
  }
}

export function decodeBurpPayload(payload: RawBurpPayload | undefined | null): string {
  if (!payload?.content) {
    return '';
  }
  try {
    if (payload.base64) {
      // Dynamic import avoided — worker and main thread both use atob via Base64 in service layer.
      // This function is overridden in worker with inline atob for bundled Base64.
      return decodeBase64(payload.content);
    }
    return payload.content;
  } catch {
    return '';
  }
}

let decodeBase64Impl: (value: string) => string = (value) => {
  if (typeof atob === 'function') {
    return atob(value);
  }
  return value;
};

export function setDecodeBase64Impl(impl: (value: string) => string): void {
  decodeBase64Impl = impl;
}

function decodeBase64(value: string): string {
  return decodeBase64Impl(value);
}

export function splitHeaderBody(text: string): RequestResponseParts {
  const [header = '', ...bodyParts] = text.split(/\n\s*\n/);
  const headerLines = header.split(/\r?\n/).map((line) => line.replace(/\r$/, ''));
  const parsedHeader: HeaderEntry[] = headerLines.map((line) => {
    const [key, ...valueParts] = line.split(': ');
    return [key, valueParts.join(': ')];
  });
  return [parsedHeader, bodyParts.join('\n\n')];
}

export function extractTitleFromHttpResponse(response: string): string {
  const match = response.match(/<title>(.*?)<\/title>/i);
  return match?.[1] ?? '';
}

export function buildMetadataSearchIndex(fields: MetadataSearchFields): string {
  const parts: string[] = [];
  for (const key of METADATA_SEARCH_KEYS) {
    const value = fields[key];
    if (value === null || value === undefined || value === '') {
      continue;
    }
    parts.push(String(value));
  }
  return parts.join(' ').toLowerCase();
}

export function buildBodySearchIndex(requestText: string, responseText: string): string {
  const parts: string[] = [];
  if (requestText) {
    parts.push(requestText);
  }
  if (responseText) {
    parts.push(responseText);
  }
  return parts.join(' ').toLowerCase();
}

export function indexRowBodySearch(
  rawRequest: RawBurpPayload,
  rawResponse: RawBurpPayload,
): { bodySearchText: string; title: string } {
  const requestText = decodeBurpPayload(rawRequest);
  const responseText = decodeBurpPayload(rawResponse);
  return {
    bodySearchText: buildBodySearchIndex(requestText, responseText),
    title: extractTitleFromHttpResponse(responseText),
  };
}

export function estimateRawPayloadSize(
  rawRequest: RawBurpPayload | undefined,
  rawResponse: RawBurpPayload | undefined,
): number {
  return (rawRequest?.content?.length ?? 0) + (rawResponse?.content?.length ?? 0);
}

export function indexRowBodies(
  rawRequest: RawBurpPayload,
  rawResponse: RawBurpPayload,
): {
  bodySearchText: string;
  title: string;
  request: RequestResponseParts;
  response: RequestResponseParts;
} {
  const requestText = decodeBurpPayload(rawRequest);
  const responseText = decodeBurpPayload(rawResponse);
  return {
    bodySearchText: buildBodySearchIndex(requestText, responseText),
    title: extractTitleFromHttpResponse(responseText),
    request: splitHeaderBody(requestText),
    response: splitHeaderBody(responseText),
  };
}