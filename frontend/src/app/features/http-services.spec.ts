import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { Observable } from 'rxjs';
import { PatientsService } from './patients/services/patients.service';
import { ReportsService } from './reports/services/reports.service';
import { QuotesService } from './quotes/services/quotes.service';
import { PatientInvitesService } from './patient-invites/services/patient-invites.service';
import { AppointmentsService } from './appointments/services/appointments.service';
import { BookingService } from './booking/services/booking.service';
import { AdminDoctorsService } from './admin/services/admin-doctors.service';

const API = 'http://localhost:2999';

interface Case {
  readonly name: string;
  readonly call: () => Observable<unknown>;
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
  readonly params?: Record<string, string>;
}

function services() {
  return {
    patients: TestBed.inject(PatientsService),
    reports: TestBed.inject(ReportsService),
    quotes: TestBed.inject(QuotesService),
    invites: TestBed.inject(PatientInvitesService),
    appointments: TestBed.inject(AppointmentsService),
    booking: TestBed.inject(BookingService),
    admin: TestBed.inject(AdminDoctorsService),
  };
}

// Cada método del front tiene que pegarle al endpoint exacto del backend: si
// alguno cambia de ruta o de verbo, este spec lo marca antes que el usuario.
function cases(s: ReturnType<typeof services>): Case[] {
  const body = { any: 'data' } as never;
  return [
    { name: 'pacientes: listar todos', call: () => s.patients.getAll(), method: 'GET', url: `${API}/patients`, params: {} },
    {
      name: 'pacientes: listar los de un doctor',
      call: () => s.patients.getAll('doctor-1'),
      method: 'GET',
      url: `${API}/patients`,
      params: { doctorId: 'doctor-1' },
    },
    { name: 'pacientes: mi ficha', call: () => s.patients.getMyPatient(), method: 'GET', url: `${API}/patients/me` },
    { name: 'pacientes: estado de mi ficha', call: () => s.patients.getMyPatientStatus(), method: 'GET', url: `${API}/patients/me/status` },
    { name: 'pacientes: crear', call: () => s.patients.createPatient(body), method: 'POST', url: `${API}/patients`, body },
    { name: 'pacientes: actualizar', call: () => s.patients.updatePatient('p1', body), method: 'PATCH', url: `${API}/patients/p1`, body },
    { name: 'pacientes: guardar historial médico', call: () => s.patients.createMedicalHistory('p1', body), method: 'POST', url: `${API}/patients/p1/medical-history`, body },
    { name: 'pacientes: leer historial médico', call: () => s.patients.getMedicalHistory('p1'), method: 'GET', url: `${API}/patients/p1/medical-history` },
    { name: 'pacientes: guardar hábitos', call: () => s.patients.createHygieneHabits('p1', body), method: 'POST', url: `${API}/patients/p1/hygiene-habits`, body },
    { name: 'pacientes: leer hábitos', call: () => s.patients.getHygieneHabits('p1'), method: 'GET', url: `${API}/patients/p1/hygiene-habits` },
    { name: 'pacientes: guardar examen clínico', call: () => s.patients.createClinicalExam('p1', body), method: 'POST', url: `${API}/patients/p1/clinical-exams`, body },
    { name: 'pacientes: último examen clínico', call: () => s.patients.getLatestClinicalExam('p1'), method: 'GET', url: `${API}/patients/p1/clinical-exams/latest` },
    { name: 'pacientes: leer odontograma', call: () => s.patients.getOdontogramEntries('p1'), method: 'GET', url: `${API}/patients/p1/odontogram-entries` },
    { name: 'pacientes: guardar odontograma', call: () => s.patients.createOdontogramEntries('p1', body), method: 'POST', url: `${API}/patients/p1/odontogram-entries`, body },
    { name: 'pacientes: guardar examen dental', call: () => s.patients.createDentalExam('p1', body), method: 'POST', url: `${API}/patients/p1/dental-exams`, body },
    { name: 'pacientes: versiones del examen dental', call: () => s.patients.getDentalExamVersions('p1'), method: 'GET', url: `${API}/patients/p1/dental-exams` },
    { name: 'pacientes: examen dental vigente', call: () => s.patients.getCurrentDentalExam('p1'), method: 'GET', url: `${API}/patients/p1/dental-exams/current` },
    { name: 'pacientes: un examen dental', call: () => s.patients.getDentalExam('p1', 'e1'), method: 'GET', url: `${API}/patients/p1/dental-exams/e1` },
    {
      name: 'reportes: operativo de todos los doctores',
      call: () => s.reports.getOperational({ from: '2026-09-01', to: '2026-09-30' }),
      method: 'GET',
      url: `${API}/admin/reports/operational`,
      params: { from: '2026-09-01', to: '2026-09-30' },
    },
    {
      name: 'reportes: financiero de un doctor',
      call: () => s.reports.getFinancial({ from: '2026-09-01', to: '2026-09-30', doctorId: 'doctor-1' }),
      method: 'GET',
      url: `${API}/admin/reports/financial`,
      params: { from: '2026-09-01', to: '2026-09-30', doctorId: 'doctor-1' },
    },
    { name: 'presupuestos: crear sin notas', call: () => s.quotes.createForPatient('p1'), method: 'POST', url: `${API}/patients/p1/quotes`, body: {} },
    { name: 'presupuestos: listar del paciente', call: () => s.quotes.getByPatient('p1'), method: 'GET', url: `${API}/patients/p1/quotes` },
    { name: 'presupuestos: leer uno', call: () => s.quotes.getById('q1'), method: 'GET', url: `${API}/quotes/q1` },
    { name: 'presupuestos: agregar ítem', call: () => s.quotes.addItem('q1', body), method: 'POST', url: `${API}/quotes/q1/items`, body },
    { name: 'presupuestos: quitar ítem', call: () => s.quotes.removeItem('q1', 'i1'), method: 'DELETE', url: `${API}/quotes/q1/items/i1` },
    { name: 'presupuestos: registrar pago', call: () => s.quotes.addPayment('q1', body), method: 'POST', url: `${API}/quotes/q1/payments`, body },
    {
      name: 'invitaciones: enviar',
      call: () => s.invites.createInvite('p1', 'whatsapp'),
      method: 'POST',
      url: `${API}/patients/p1/invites`,
      body: { channel: 'whatsapp' },
    },
    { name: 'invitaciones: validar el link', call: () => s.invites.checkStatus('tok'), method: 'GET', url: `${API}/invites/tok/status` },
    { name: 'agenda: sin filtros', call: () => s.appointments.getAgenda(), method: 'GET', url: `${API}/appointments`, params: {} },
    {
      name: 'agenda: con todos los filtros',
      call: () =>
        s.appointments.getAgenda({ status: 'confirmed', from: '2026-09-24', to: '2026-09-25', doctorId: 'doctor-1', scope: 'all' }),
      method: 'GET',
      url: `${API}/appointments`,
      params: { status: 'confirmed', from: '2026-09-24', to: '2026-09-25', doctorId: 'doctor-1', scope: 'all' },
    },
    { name: 'reserva: doctores', call: () => s.booking.getDoctors(), method: 'GET', url: `${API}/public/doctors` },
    {
      name: 'reserva: disponibilidad de un día',
      call: () => s.booking.getAvailability('2026-09-24', 'doctor-1'),
      method: 'GET',
      url: `${API}/public/availability`,
      params: { date: '2026-09-24', doctorId: 'doctor-1' },
    },
    {
      name: 'reserva: disponibilidad de dos semanas',
      call: () => s.booking.getAvailabilityRange('2026-09-24', 'doctor-1'),
      method: 'GET',
      url: `${API}/public/availability-range`,
      params: { from: '2026-09-24', doctorId: 'doctor-1', days: '14' },
    },
    {
      name: 'reserva: tomar horario',
      call: () => s.booking.holdSlot('2026-09-24T13:00:00Z', 'doctor-1'),
      method: 'POST',
      url: `${API}/public/appointments/hold`,
      body: { slot: '2026-09-24T13:00:00Z', doctorId: 'doctor-1' },
    },
    { name: 'reserva: datos del invitado', call: () => s.booking.saveGuestContact('a1', body), method: 'PATCH', url: `${API}/public/appointments/a1/contact`, body },
    { name: 'reserva: generar QR de pago', call: () => s.booking.checkout('a1'), method: 'POST', url: `${API}/public/appointments/a1/checkout`, body: {} },
    { name: 'reserva: estado del pago', call: () => s.booking.getStatus('a1'), method: 'GET', url: `${API}/public/appointments/a1/status` },
    { name: 'admin: listar doctores', call: () => s.admin.getAll(), method: 'GET', url: `${API}/admin/doctors` },
    { name: 'admin: un doctor', call: () => s.admin.getById('d1'), method: 'GET', url: `${API}/admin/doctors/d1` },
    { name: 'admin: crear doctor', call: () => s.admin.create(body), method: 'POST', url: `${API}/admin/doctors`, body },
    { name: 'admin: editar doctor', call: () => s.admin.update('d1', body), method: 'PATCH', url: `${API}/admin/doctors/d1`, body },
    {
      name: 'admin: invitar doctor',
      call: () => s.admin.createInvite('d1', 'email'),
      method: 'POST',
      url: `${API}/admin/doctors/d1/invites`,
      body: { channel: 'email' },
    },
    { name: 'admin: dar de baja', call: () => s.admin.deactivate('d1'), method: 'PATCH', url: `${API}/admin/doctors/d1/deactivate`, body: {} },
  ];
}

describe('servicios HTTP del front', () => {
  let http: HttpTestingController;
  let s: ReturnType<typeof services>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    s = services();
  });

  afterEach(() => http.verify());

  it('cubre cada endpoint una sola vez', () => {
    const names = cases(s).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const index of cases({} as ReturnType<typeof services>).keys()) {
    it(`caso ${index + 1}: pega al endpoint correcto y devuelve la respuesta`, () => {
      const c = cases(s)[index];
      let response: unknown;

      c.call().subscribe((r) => (response = r));
      const req = http.expectOne((r) => r.url === c.url);

      expect(req.request.method, c.name).toBe(c.method);
      if (c.body !== undefined) {
        expect(req.request.body, c.name).toEqual(c.body);
      }
      if (c.params) {
        const params = Object.fromEntries(req.request.params.keys().map((k) => [k, req.request.params.get(k)]));
        expect(params, c.name).toEqual(c.params);
      }
      req.flush({ ok: c.name });
      expect(response).toEqual({ ok: c.name });
    });
  }
});
