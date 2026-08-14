import { FacturaBoExchangeRateProvider } from './factura-bo-exchange-rate.provider';

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const VALID_BODY = {
  ok: true,
  datos: {
    ufv_bob: 3.32997,
    usd_bob: 11.66,
    fuente: 'Banco Central de Bolivia',
    moneda_base: 'BOB',
    fecha_actualizacion: '2026-08-13T04:05:06.187989+00:00',
    url_fuente: 'https://www.bcb.gob.bo/tco_reporte_ultima_cotizacion.php',
  },
  error: null,
  timestamp: '2026-08-13T16:27:53.947971+00:00',
};

describe('FacturaBoExchangeRateProvider', () => {
  let provider: FacturaBoExchangeRateProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    provider = new FacturaBoExchangeRateProvider();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('fetches and returns the rate on a cold cache', async () => {
    fetchSpy.mockResolvedValue(fakeResponse(VALID_BODY));

    const result = await provider.getUsdToBob();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      rate: 11.66,
      source: 'Banco Central de Bolivia',
      stale: false,
    });
  });

  it('does not refetch within the TTL', async () => {
    fetchSpy.mockResolvedValue(fakeResponse(VALID_BODY));

    await provider.getUsdToBob();
    await provider.getUsdToBob();
    await provider.getUsdToBob();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches once the TTL has expired', async () => {
    fetchSpy.mockResolvedValue(fakeResponse(VALID_BODY));
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);

    await provider.getUsdToBob();
    nowSpy.mockReturnValue(1_000_000 + 7 * 60 * 60 * 1000); // +7h, TTL es 6h
    await provider.getUsdToBob();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('falls back to the last known rate, marked stale, if the refetch fails', async () => {
    fetchSpy
      .mockResolvedValueOnce(fakeResponse(VALID_BODY))
      .mockRejectedValueOnce(new Error('network down'));
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);

    const first = await provider.getUsdToBob();
    nowSpy.mockReturnValue(1_000_000 + 7 * 60 * 60 * 1000);
    const second = await provider.getUsdToBob();

    expect(second).toMatchObject({ rate: first!.rate, stale: true });
    nowSpy.mockRestore();
  });

  it('returns null when there is no cache and the fetch fails', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    const result = await provider.getUsdToBob();

    expect(result).toBeNull();
  });

  it('treats a malformed response (non-numeric usd_bob) as a failure', async () => {
    fetchSpy.mockResolvedValue(
      fakeResponse({ ok: true, datos: { usd_bob: 'not-a-number' } }),
    );

    const result = await provider.getUsdToBob();

    expect(result).toBeNull();
  });

  it('treats an HTTP error response as a failure', async () => {
    fetchSpy.mockResolvedValue(fakeResponse({ ok: false }, false, 500));

    const result = await provider.getUsdToBob();

    expect(result).toBeNull();
  });
});
