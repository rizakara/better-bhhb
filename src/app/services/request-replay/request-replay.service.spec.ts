import { TestBed } from '@angular/core/testing';
import { RequestReplayService } from './request-replay.service';

describe('RequestReplayService', () => {
  let service: RequestReplayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RequestReplayService);
  });

  const sampleRawRequest = [
    'POST /api/login HTTP/1.1',
    'Host: example.com',
    'Content-Type: application/json',
    'Connection: close',
    '',
    '{"user":"admin"}',
  ].join('\r\n');

  it('builds curl from a raw HTTP request', () => {
    const curl = service.rawRequestToCurl(sampleRawRequest, 'https://example.com');

    expect(curl).toContain(`curl -X POST 'https://example.com/api/login'`);
    expect(curl).toContain(`-H 'Content-Type: application/json'`);
    expect(curl).toContain(`--data-binary '{"user":"admin"}'`);
    expect(curl).not.toContain('Connection');
    expect(curl).not.toContain('Host:');
  });

  it('builds python requests from a raw HTTP request', () => {
    const python = service.rawRequestToPythonRequests(sampleRawRequest, 'https://example.com');

    expect(python).toContain('import requests');
    expect(python).toContain(`response = requests.post(`);
    expect(python).toContain(`'https://example.com/api/login'`);
    expect(python).toContain(`'Content-Type': 'application/json'`);
    expect(python).toContain(`data='{"user":"admin"}'`);
    expect(python).not.toContain('Connection');
  });

  it('builds fetch from a raw HTTP request', () => {
    const fetchSnippet = service.rawRequestToFetch(sampleRawRequest, 'https://example.com');

    expect(fetchSnippet).toContain(`fetch("https://example.com/api/login", {`);
    expect(fetchSnippet).toContain(`method: "POST"`);
    expect(fetchSnippet).toContain(`"Content-Type": "application/json"`);
    expect(fetchSnippet).toContain(`body: "{\\"user\\":\\"admin\\"}"`);
  });

  it('builds axios from a raw HTTP request', () => {
    const axiosSnippet = service.rawRequestToAxios(sampleRawRequest, 'https://example.com');

    expect(axiosSnippet).toContain('axios({');
    expect(axiosSnippet).toContain(`method: "post"`);
    expect(axiosSnippet).toContain(`url: "https://example.com/api/login"`);
    expect(axiosSnippet).toContain(`"Content-Type": "application/json"`);
    expect(axiosSnippet).toContain(`data: "{\\"user\\":\\"admin\\"}"`);
  });

  it('builds httpie from a raw HTTP request', () => {
    const httpie = service.rawRequestToHttpie(sampleRawRequest, 'https://example.com');

    expect(httpie).toContain(`http POST 'https://example.com/api/login' \\`);
    expect(httpie).toContain(`'Content-Type:application/json' \\`);
    expect(httpie).toContain(`<<< '{"user":"admin"}'`);
    expect(httpie).not.toContain('Connection');
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