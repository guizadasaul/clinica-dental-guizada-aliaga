import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { PatientWithUser, Patient, PatientProfileStatus, MedicalHistory, HygieneHabits, ClinicalExam, OdontogramEntry } from '../models/patient.model';
import type { DentalExam, DentalExamVersionSummary } from '../models/dental-exam.model';
import type {
  CreatePatientRequest,
  UpdatePatientRequest,
  CreateMedicalHistoryRequest,
  CreateHygieneHabitsRequest,
  CreateClinicalExamRequest,
  CreateOdontogramEntriesRequest,
} from '../models/patient.request';
import type { CreateDentalExamRequest } from '../models/dental-exam.request';

@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/patients`;

  getAll(): Observable<PatientWithUser[]> {
    return this.http.get<PatientWithUser[]>(this.base);
  }

  getMyPatient(): Observable<Patient> {
    return this.http.get<Patient>(`${this.base}/me`);
  }

  getMyPatientStatus(): Observable<PatientProfileStatus> {
    return this.http.get<PatientProfileStatus>(`${this.base}/me/status`);
  }

  createPatient(data: CreatePatientRequest): Observable<Patient> {
    return this.http.post<Patient>(this.base, data);
  }

  updatePatient(patientId: string, data: UpdatePatientRequest): Observable<Patient> {
    return this.http.patch<Patient>(`${this.base}/${patientId}`, data);
  }

  createMedicalHistory(patientId: string, data: CreateMedicalHistoryRequest): Observable<MedicalHistory> {
    return this.http.post<MedicalHistory>(`${this.base}/${patientId}/medical-history`, data);
  }

  getMedicalHistory(patientId: string): Observable<MedicalHistory | null> {
    return this.http.get<MedicalHistory | null>(`${this.base}/${patientId}/medical-history`);
  }

  createHygieneHabits(patientId: string, data: CreateHygieneHabitsRequest): Observable<HygieneHabits> {
    return this.http.post<HygieneHabits>(`${this.base}/${patientId}/hygiene-habits`, data);
  }

  getHygieneHabits(patientId: string): Observable<HygieneHabits | null> {
    return this.http.get<HygieneHabits | null>(`${this.base}/${patientId}/hygiene-habits`);
  }

  createClinicalExam(patientId: string, data: CreateClinicalExamRequest): Observable<ClinicalExam> {
    return this.http.post<ClinicalExam>(`${this.base}/${patientId}/clinical-exams`, data);
  }

  getLatestClinicalExam(patientId: string): Observable<ClinicalExam | null> {
    return this.http.get<ClinicalExam | null>(`${this.base}/${patientId}/clinical-exams/latest`);
  }

  getOdontogramEntries(patientId: string): Observable<OdontogramEntry[]> {
    return this.http.get<OdontogramEntry[]>(`${this.base}/${patientId}/odontogram-entries`);
  }

  createOdontogramEntries(patientId: string, data: CreateOdontogramEntriesRequest): Observable<OdontogramEntry[]> {
    return this.http.post<OdontogramEntry[]>(`${this.base}/${patientId}/odontogram-entries`, data);
  }

  createDentalExam(patientId: string, data: CreateDentalExamRequest): Observable<DentalExam> {
    return this.http.post<DentalExam>(`${this.base}/${patientId}/dental-exams`, data);
  }

  getDentalExamVersions(patientId: string): Observable<DentalExamVersionSummary[]> {
    return this.http.get<DentalExamVersionSummary[]>(`${this.base}/${patientId}/dental-exams`);
  }

  getCurrentDentalExam(patientId: string): Observable<DentalExam | null> {
    return this.http.get<DentalExam | null>(`${this.base}/${patientId}/dental-exams/current`);
  }

  getDentalExam(patientId: string, examId: string): Observable<DentalExam> {
    return this.http.get<DentalExam>(`${this.base}/${patientId}/dental-exams/${examId}`);
  }
}
