import { TestBed } from '@angular/core/testing';
import { RequestReplayService } from './request-replay.service';

describe('RequestReplayService', () => {
  let service: RequestReplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RequestReplayService);
  });

  it('builds curl from a raw HTTP request', () => {
    const raw = [
      'POST /api/login HTTP/1.1',
      'Host: example.com',
      'Content-Type: application/json',
      'Connection: close',
      '',
      '{"user":"admin"}',
    ].join('\r\n');

    const curl = service.rawRequestToCurl(raw, 'https://example.com');

    expect(curl).toContain(`curl -X POST 'https://example.com/api/login'`);
    expect(curl).toContain(`-H 'Content-Type: application/json'`);
    expect(curl).toContain(`--data-binary '{"user":"admin"}'`);
    expect(curl).not.toContain('Connection');
    expect(curl).not.toContain('Host:');
  });

  it('round-trips request parts to raw text', () => {
    const parts: [Array<[string, string]>, string] = [
      [
        ['GET /index HTTP/1.1', ''],
        ['Host', 'example.com'],
        ['Accept', '*/*'],
      ],
      '',
    ];

    const raw = service.requestPartsToRaw(parts);
    const parsed = service.parseRawRequest(raw);

    expect(parsed.method).toBe('GET');
    expect(parsed.target).toBe('/index');
    expect(parsed.headers).toEqual([
      { key: 'Host', value: 'example.com' },
      { key: 'Accept', value: '*/*' },
    ]);

    const roundTrip = service.rawRequestToParts(raw);
    expect(service.requestPartsToRaw(roundTrip)).toBe(raw);
  });

  it('extracts request headers without the request line', () => {
    const headers: Array<[string, string]> = [
      ['GET /index HTTP/1.1', ''],
      ['Host', 'example.com'],
      ['Cookie', 'session=abc; theme=dark'],
    ];

    expect(service.extractHttpHeaders(headers)).toEqual([
      { key: 'Host', value: 'example.com' },
      { key: 'Cookie', value: 'session=abc; theme=dark' },
    ]);
  });

  it('parses request cookies from Cookie headers', () => {
    const headers: Array<[string, string]> = [
      ['GET / HTTP/1.1', ''],
      ['Cookie', 'session=abc; theme=dark'],
      ['Cookie', 'lang=en'],
    ];

    expect(service.parseRequestCookies(headers)).toEqual([
      { name: 'session', value: 'abc' },
      { name: 'theme', value: 'dark' },
      { name: 'lang', value: 'en' },
    ]);
  });
});