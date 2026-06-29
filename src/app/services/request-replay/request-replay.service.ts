import { Injectable } from '@angular/core';

export interface ParsedHttpRequest {
  method: string;
  target: string;
  headers: Array<{ key: string; value: string }>;
  body: string;
}

export interface ParsedCookie {
  name: string;
  value: string;
}

export interface HttpHeaderRow {
  key: string;
  value: string;
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

  extractHttpHeaders(headerRows: Array<[string, string]>): HttpHeaderRow[] {
    return headerRows
      .slice(1)
      .map(([key, value]) => ({ key, value }))
      .filter((row) => !!row.key);
  }

  parseRequestCookies(headerRows: Array<[string, string]>): ParsedCookie[] {
    const cookies: ParsedCookie[] = [];
    headerRows.slice(1).forEach(([key, value]) => {
      if (key.toLowerCase() !== 'cookie' || !value) {
        return;
      }
      value.split(';').forEach((part) => {
        const trimmed = part.trim();
        if (!trimmed) {
          return;
        }
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) {
          cookies.push({ name: trimmed, value: '' });
          return;
        }
        cookies.push({
          name: trimmed.slice(0, eqIndex).trim(),
          value: trimmed.slice(eqIndex + 1).trim(),
        });
      });
    });
    return cookies;
  }

  rawRequestToCurl(raw: string, fallbackBaseUrl?: string, fallbackUrl?: string): string {
    const context = this.buildRequestContext(raw, fallbackBaseUrl, fallbackUrl);
    const parts = [`curl`, `-X`, context.method, this.shellEscape(context.url)];

    context.headers.forEach((header) => {
      parts.push('-H', this.shellEscape(`${header.key}: ${header.value}`));
    });

    if (context.body) {
      parts.push('--data-binary', this.shellEscape(context.body));
    }

    return parts.join(' ');
  }

  rawRequestToPythonRequests(raw: string, fallbackBaseUrl?: string, fallbackUrl?: string): string {
    const context = this.buildRequestContext(raw, fallbackBaseUrl, fallbackUrl);
    const lines = ['import requests', ''];
    const method = context.method.toLowerCase();
    const headerEntries = context.headers.map(
      (header) => `        ${this.pythonStringLiteral(header.key)}: ${this.pythonStringLiteral(header.value)},`,
    );

    lines.push(`response = requests.${method}(`);
    lines.push(`    ${this.pythonStringLiteral(context.url)},`);

    if (headerEntries.length) {
      lines.push('    headers={');
      lines.push(...headerEntries);
      lines.push('    },');
    }

    if (context.body) {
      lines.push(`    data=${this.pythonStringLiteral(context.body)},`);
    }

    lines.push(')');
    return lines.join('\n');
  }

  rawRequestToFetch(raw: string, fallbackBaseUrl?: string, fallbackUrl?: string): string {
    const context = this.buildRequestContext(raw, fallbackBaseUrl, fallbackUrl);
    const lines = [`fetch(${this.jsStringLiteral(context.url)}, {`];
    lines.push(`  method: ${this.jsStringLiteral(context.method)},`);

    if (context.headers.length) {
      lines.push('  headers: {');
      context.headers.forEach((header) => {
        lines.push(`    ${this.jsObjectKey(header.key)}: ${this.jsStringLiteral(header.value)},`);
      });
      lines.push('  },');
    }

    if (context.body) {
      lines.push(`  body: ${this.jsStringLiteral(context.body)},`);
    }

    lines.push('});');
    return lines.join('\n');
  }

  rawRequestToAxios(raw: string, fallbackBaseUrl?: string, fallbackUrl?: string): string {
    const context = this.buildRequestContext(raw, fallbackBaseUrl, fallbackUrl);
    const lines = ['axios({'];
    lines.push(`  method: ${this.jsStringLiteral(context.method.toLowerCase())},`);
    lines.push(`  url: ${this.jsStringLiteral(context.url)},`);

    if (context.headers.length) {
      lines.push('  headers: {');
      context.headers.forEach((header) => {
        lines.push(`    ${this.jsObjectKey(header.key)}: ${this.jsStringLiteral(header.value)},`);
      });
      lines.push('  },');
    }

    if (context.body) {
      lines.push(`  data: ${this.jsStringLiteral(context.body)},`);
    }

    lines.push('});');
    return lines.join('\n');
  }

  rawRequestToHttpie(raw: string, fallbackBaseUrl?: string, fallbackUrl?: string): string {
    const context = this.buildRequestContext(raw, fallbackBaseUrl, fallbackUrl);
    const lines = [`http ${context.method} ${this.shellEscape(context.url)} \\`];

    context.headers.forEach((header) => {
      lines.push(`  ${this.shellEscape(`${header.key}:${header.value}`)} \\`);
    });

    if (context.body) {
      lines.push(`  <<< ${this.shellEscape(context.body)}`);
    } else {
      const lastLine = lines[lines.length - 1];
      lines[lines.length - 1] = lastLine.replace(/ \\$/, '');
    }

    return lines.join('\n');
  }

  private buildRequestContext(
    raw: string,
    fallbackBaseUrl?: string,
    fallbackUrl?: string,
  ): { method: string; url: string; headers: Array<{ key: string; value: string }>; body: string } {
    const parsed = this.parseRawRequest(raw);
    const url = this.resolveUrl(parsed.target, parsed.headers, fallbackBaseUrl, fallbackUrl);
    const headers = parsed.headers.filter((header) => !this.shouldSkipReplayHeader(header.key.toLowerCase()));

    return {
      method: parsed.method,
      url,
      headers,
      body: parsed.body,
    };
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

  private shouldSkipReplayHeader(key: string): boolean {
    return ['host', 'connection', 'content-length', 'transfer-encoding', 'proxy-connection'].includes(key);
  }

  private shellEscape(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private pythonStringLiteral(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  private jsStringLiteral(value: string): string {
    return JSON.stringify(value);
  }

  private jsObjectKey(key: string): string {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : this.jsStringLiteral(key);
  }
}