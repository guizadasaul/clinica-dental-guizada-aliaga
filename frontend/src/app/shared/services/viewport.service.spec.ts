import { TestBed } from '@angular/core/testing';
import { ViewportService } from './viewport.service';

interface FakeQuery {
  matches: boolean;
  media: string;
  listener: ((e: MediaQueryListEvent) => void) | null;
  addEventListener: (type: string, fn: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: string, fn: (e: MediaQueryListEvent) => void) => void;
}

function fakeMatchMedia(matches: boolean) {
  const query: FakeQuery = {
    matches,
    media: '',
    listener: null,
    addEventListener: (_type, fn) => (query.listener = fn),
    removeEventListener: () => (query.listener = null),
  };
  // jsdom no trae matchMedia: se instala uno falso por test.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => {
      query.media = media;
      return query as unknown as MediaQueryList;
    },
  });
  return { query };
}

describe('ViewportService', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('sin matchMedia (SSR o navegador viejo) toma escritorio', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;

    expect(TestBed.inject(ViewportService).isMobile()).toBe(false);
  });

  it('mira el mismo corte que los @media del panel (menos de 768 px)', () => {
    const { query } = fakeMatchMedia(true);

    const service = TestBed.inject(ViewportService);

    expect(query.media).toBe('(max-width: 767px)');
    expect(service.isMobile()).toBe(true);
  });

  it('se actualiza al girar el teléfono o cambiar el ancho de la ventana', () => {
    const { query } = fakeMatchMedia(false);
    const service = TestBed.inject(ViewportService);
    expect(service.isMobile()).toBe(false);

    query.listener?.({ matches: true } as MediaQueryListEvent);
    expect(service.isMobile()).toBe(true);

    query.listener?.({ matches: false } as MediaQueryListEvent);
    expect(service.isMobile()).toBe(false);
  });

  it('deja de escuchar cuando se destruye el inyector', () => {
    const { query } = fakeMatchMedia(false);
    TestBed.inject(ViewportService);
    expect(query.listener).not.toBeNull();

    TestBed.resetTestingModule();

    expect(query.listener).toBeNull();
  });
});
