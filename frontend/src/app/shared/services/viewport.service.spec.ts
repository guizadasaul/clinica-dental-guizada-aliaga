import { TestBed } from '@angular/core/testing';
import { ViewportService } from './viewport.service';

interface FakeQuery {
  matches: boolean;
  listener: ((e: MediaQueryListEvent) => void) | null;
  addEventListener: (type: string, fn: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, fn: (e: MediaQueryListEvent) => void) => void;
}

/** matchMedia falso: una consulta por media query, con el `matches` que se le pase. */
function fakeMatchMedia(matchesByQuery: Record<string, boolean>) {
  const queries = new Map<string, FakeQuery>();
  // jsdom no trae matchMedia: se instala uno falso por test.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => {
      const query: FakeQuery = {
        matches: matchesByQuery[media] ?? false,
        listener: null,
        addEventListener: (_type, fn) => (query.listener = fn),
        removeEventListener: () => (query.listener = null),
      };
      queries.set(media, query);
      return query as unknown as MediaQueryList;
    },
  });
  return queries;
}

const MOBILE = '(max-width: 767px)';
const COMPACT = '(max-width: 1023px)';

describe('ViewportService', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('sin matchMedia (SSR o navegador viejo) toma escritorio', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;

    const service = TestBed.inject(ViewportService);

    expect(service.isMobile()).toBe(false);
    expect(service.isCompact()).toBe(false);
  });

  it('mira los mismos cortes que los @media del panel: 768 y 1024 px', () => {
    const queries = fakeMatchMedia({ [MOBILE]: false, [COMPACT]: true });

    const service = TestBed.inject(ViewportService);

    expect([...queries.keys()]).toEqual([MOBILE, COMPACT]);
    // Una tablet en vertical: no es celular, pero sí compacta.
    expect(service.isMobile()).toBe(false);
    expect(service.isCompact()).toBe(true);
  });

  it('se actualiza al girar el teléfono o cambiar el ancho de la ventana', () => {
    const queries = fakeMatchMedia({});
    const service = TestBed.inject(ViewportService);
    expect(service.isMobile()).toBe(false);

    queries.get(MOBILE)!.listener?.({ matches: true } as MediaQueryListEvent);
    queries.get(COMPACT)!.listener?.({ matches: true } as MediaQueryListEvent);
    expect(service.isMobile()).toBe(true);
    expect(service.isCompact()).toBe(true);

    queries.get(MOBILE)!.listener?.({ matches: false } as MediaQueryListEvent);
    expect(service.isMobile()).toBe(false);
  });

  it('deja de escuchar cuando se destruye el inyector', () => {
    const queries = fakeMatchMedia({});
    TestBed.inject(ViewportService);
    expect(queries.get(MOBILE)!.listener).not.toBeNull();

    TestBed.resetTestingModule();

    expect(queries.get(MOBILE)!.listener).toBeNull();
    expect(queries.get(COMPACT)!.listener).toBeNull();
  });
});
