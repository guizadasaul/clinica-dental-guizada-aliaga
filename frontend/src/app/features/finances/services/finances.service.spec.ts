import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FinancesService } from './finances.service';
import { environment } from '../../../../environments/environment';

describe('FinancesService.listPatients', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { service: TestBed.inject(FinancesService), http: TestBed.inject(HttpTestingController) };
  }

  it('manda la búsqueda sin espacios', () => {
    const { service, http } = setup();

    service.listPatients('  ana ').subscribe();

    const req = http.expectOne(`${environment.backendUrl}/finances/patients?search=ana`);
    expect(req.request.params.get('search')).toBe('ana');
    req.flush([]);
  });

  it('sin búsqueda no manda el parámetro', () => {
    const { service, http } = setup();

    service.listPatients('   ').subscribe();

    const req = http.expectOne(`${environment.backendUrl}/finances/patients`);
    expect(req.request.params.has('search')).toBe(false);
    req.flush([]);
  });
});
