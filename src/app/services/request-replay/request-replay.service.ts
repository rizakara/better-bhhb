import { Injectable } from '@angular/core';

export interface ParsedHttpRequest {
  method: string;
  target: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
}

type RequestParts = [Array<[string, string]>, string];

@Injectable({
  providedIn: 'root'
})
export class RequestReplayService {

  rawRequestToParts(raw: string): RequestParts {
    const normalized = raw.replace(/\r\n/g, '\n');
    const separatorIndex = normalized.indexOf('\n\n');
    const headPart = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
    const body = separatorIndex === -1 ? '' : normalized.slice(separatorIndex + 2).replace(/\n/g, '\r\n');
    const lines = headPart.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);

    if (!lines.length) {
      throw new Error('Request is empty.');
    }

    const headerRows = lines.map((line, index) => {
      if (index === 0) {
        return [line, ''] as [string, string];
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        return [line, ''] as [string, string];
      }
      return [line.slice(0, colonIndex).trim(), line.slice(colonIndex + 1).trim()] as [string, string];
    });

    return [headerRows, body];
  }

  requestPartsToRaw(request: RequestParts): string {
    const [headerRows, body] = request;
    const lines = headerRows.map((row) => {
      const [key, value] = row;
      if (value === undefined || value === '') {
        return key;
      }
      return `${key}: ${value}`;
    });
    return `${lines.join('\r\n')}\r\n\r\n${body ?? ''}`;
  }

  parseRawRequest(raw: string): ParsedHttpRequest {
    const normalized = raw.replace(/\r\n/g, '\n');
    const separatorIndex = normalized.indexOf('\n\n');
    const headPart = separatorIndex === -1 ? normalized : normalized.slice(0, separatorIndex);
    const body = separatorIndex === -1 ? '' : normalized.slice(separatorIndex + 2).replace(/\n/g, '\r\n');

    const lines = headPart.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0);
    if (!lines.length) {
      throw new Error('Request is empty.');
    }

    const requestLine = lines[0];
    const requestLineMatch = requestLine.match(/^(\S+)\s+(\S+)(?:\s+HTTP\/\d(?:\.\d)?)?$/i);
    if (!requestLineMatch) {
      throw new Error('Invalid request line.');
    }

    const headers: Array<{ key: string; value: string }> = [];
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (key) {
        headers.push({ key, value });
      }
    }

    return {
      method: requestLineMatch[1].toUpperCase(),
      target: requestLineMatch[2],
      headers,
      body,
    };
  }

  rawRequestToCurl(raw: string, fallbackBaseUrl?: string, fallbackUrl?: string): string {
    const parsed = this.parseRawRequest(raw);
    const url = this.resolveUrl(parsed.target, parsed.headers, fallbackBaseUrl, fallbackUrl);
    const parts = [`curl`, `-X`, parsed.method, this.shellEscape(url)];

    parsed.headers.forEach((header) => {
      const key = header.key.toLowerCase();
      if (this.shouldSkipCurlHeader(key)) {
        return;
      }
      parts.push('-H', this.shellEscape(`${header.key}: ${header.value}`));
    });

    if (parsed.body) {
      parts.push('--data-binary', this.shellEscape(parsed.body));
    }

    return parts.join(' ');
  }

  private resolveUrl(
    target: string,
    headers: Array<{ key: string; value: string }>,
    fallbackBaseUrl?: string,
    fallbackUrl?: string,
  ): string {
    if (/^https?:\/\//i.test(target)) {
      return target;
    }

    const hostHeader = headers.find((header) => header.key.toLowerCase() === 'host')?.value;
    const baseUrl = this.normalizeBaseUrl(fallbackBaseUrl, hostHeader);
    if (baseUrl) {
      if (target.startsWith('/')) {
        return `${baseUrl}${target}`;
      }
      return `${baseUrl}/${target}`;
    }

    if (fallbackUrl) {
      return fallbackUrl;
    }

    throw new Error('Could not determine request URL.');
  }

  private normalizeBaseUrl(fallbackBaseUrl?: string, hostHeader?: string): string | undefined {
    if (fallbackBaseUrl) {
      return fallbackBaseUrl.replace(/\/+$/, '');
    }
    if (!hostHeader) {
      return undefined;
    }
    if (/^https?:\/\//i.test(hostHeader)) {
      return hostHeader.replace(/\/+$/, '');
    }
    return `https://${hostHeader}`.replace(/\/+$/, '');
  }

  private shouldSkipCurlHeader(key: string): boolean {
    return ['host', 'connection', 'content-length', 'transfer-encoding', 'proxy-connection'].includes(key);
  }

  private shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
}