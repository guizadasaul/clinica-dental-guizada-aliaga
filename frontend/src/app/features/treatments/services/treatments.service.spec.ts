import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { TreatmentsService } from './treatments.service';

const API = 'http://localhost:2999';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(TreatmentsService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('TreatmentsService', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('el historial de un paciente se pide por su id (vista del doctor)', async () => {
    const { service, http } = setup();
    const result = firstValueFrom(service.getToothProcedures('patient-1'));
    http.expectOne(`${API}/patients/patient-1/tooth-procedures`).flush([]);
    await expect(result).resolves.toEqual([]);
  });

  it('el historial propio del paciente usa el endpoint "me", sin id (CLI-102)', async () => {
    const { service, http } = setup();
    const result = firstValueFrom(service.getMyToothProcedures());
    const req = http.expectOne(`${API}/patients/me/tooth-procedures`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await expect(result).resolves.toEqual([]);
  });
});
