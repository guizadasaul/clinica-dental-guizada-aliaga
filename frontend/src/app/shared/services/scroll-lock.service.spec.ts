import { ScrollLockService } from './scroll-lock.service';

describe('ScrollLockService', () => {
  afterEach(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('bloquea el scroll de la página mientras haya al menos un bloqueo', () => {
    const service = new ScrollLockService();

    service.lock();
    service.lock(); // p. ej. menú y modal abiertos a la vez
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    service.unlock();
    expect(document.body.style.overflow).toBe('hidden');

    service.unlock();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('un unlock de más no deja el contador negativo', () => {
    const service = new ScrollLockService();

    service.unlock();
    service.lock();

    expect(document.body.style.overflow).toBe('hidden');
  });
});
