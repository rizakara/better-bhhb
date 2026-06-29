import {
  buildBodySearchIndex,
  buildMetadataSearchIndex,
  decodeBurpPayload,
  extractTitleFromHttpResponse,
  indexRowBodies,
  splitHeaderBody,
} from './history-row-search';

describe('history-row-search', () => {
  it('builds metadata search index from row fields', () => {
    const index = buildMetadataSearchIndex({
      host: 'https://example.com',
      method: 'GET',
      path: '/api',
      status: '200',
      comment: 'note',
    });

    expect(index).toContain('https://example.com');
    expect(index).toContain('get');
    expect(index).toContain('/api');
    expect(index).toContain('note');
  });

  it('builds body search index from request and response text', () => {
    const index = buildBodySearchIndex(
      'GET /secret HTTP/1.1\r\n\r\nbody-token',
      'HTTP/1.1 200\r\n\r\nresponse-token',
    );

    expect(index).toContain('secret');
    expect(index).toContain('body-token');
    expect(index).toContain('response-token');
  });

  it('splits headers and body', () => {
    const [headers, body] = splitHeaderBody('GET / HTTP/1.1\r\nHost: example.com\r\n\r\nhello');
    expect(headers).toEqual([
      ['GET / HTTP/1.1', ''],
      ['Host', 'example.com'],
    ]);
    expect(body).toBe('hello');
  });

  it('extracts title from html response', () => {
    expect(extractTitleFromHttpResponse('<html><title>Dashboard</title></html>')).toBe('Dashboard');
  });

  it('indexes row bodies from raw payloads', () => {
    const indexed = indexRowBodies(
      { base64: false, content: 'GET /x HTTP/1.1\r\n\r\nalpha' },
      { base64: false, content: 'HTTP/1.1 200\r\n\r\n<title>Home</title>' },
    );

    expect(indexed.bodySearchText).toContain('alpha');
    expect(indexed.bodySearchText).toContain('home');
    expect(indexed.title).toBe('Home');
    expect(indexed.request[1]).toBe('alpha');
    expect(indexed.response[1]).toContain('Home');
  });

  it('decodes plain-text payloads without base64', () => {
    expect(decodeBurpPayload({ base64: false, content: 'plain-text' })).toBe('plain-text');
  });
});