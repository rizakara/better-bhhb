import { HistoryRowParseService } from './history-row-parse.service';

describe('HistoryRowParseService', () => {
  let service: HistoryRowParseService;

  beforeEach(() => {
    service = new HistoryRowParseService();
  });

  it('parses and caches row bodies by position', () => {
    const first = service.getOrParse(
      1,
      { base64: false, content: 'GET /a HTTP/1.1\r\n\r\nalpha' },
      { base64: false, content: 'HTTP/1.1 200\r\n\r\nbeta' },
    );
    const second = service.getOrParse(
      1,
      { base64: false, content: 'GET /ignored HTTP/1.1\r\n\r\nignored' },
      { base64: false, content: 'HTTP/1.1 404\r\n\r\nignored' },
    );

    expect(first.request[1]).toBe('alpha');
    expect(first.response[1]).toBe('beta');
    expect(second).toBe(first);
    expect(service.has(1)).toBeTrue();
  });

  it('attaches cached parts to a row', () => {
    service.getOrParse(
      2,
      { base64: false, content: 'GET /b HTTP/1.1\r\n\r\nbody' },
      { base64: false, content: 'HTTP/1.1 200\r\n\r\nok' },
    );

    const row: any = { position: 2 };
    expect(service.attachToRow(row)).toBeTrue();
    expect(row.request).toBeDefined();
    expect(row.response).toBeDefined();
  });

  it('clears cached entries', () => {
    service.getOrParse(
      3,
      { base64: false, content: 'GET /c HTTP/1.1\r\n\r\n' },
      { base64: false, content: 'HTTP/1.1 200\r\n\r\n' },
    );
    service.clear();
    expect(service.has(3)).toBeFalse();
  });
});