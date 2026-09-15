import type { appointments, patients, users } from '@prisma/client';
import { Appointment } from '../../domain/Appointment.js';
import { AppointmentWithPatient } from '../../domain/AppointmentWithPatient.js';

export class AppointmentMapper {
  static toDomain(record: appointments): Appointment {
    return new Appointment(
      record.id,
      record.patient_id,
      record.treatment_id,
      record.appointment_datetime,
      record.duration_minutes,
      record.status,
      record.source,
      record.guest_full_name,
      record.guest_first_name,
      record.guest_last_name_paternal,
      record.guest_last_name_maternal,
      record.guest_phone,
      record.guest_email,
      record.hold_expires_at,
      record.notes,
      record.created_at,
      record.baneco_qr_id,
      record.baneco_transaction_id,
      record.baneco_qr_image,
      record.payment_amount !== null ? Number(record.payment_amount) : null,
      record.paid_at,
    );
  }

  static toDomainWithPatient(
    record: appointments & { patients: (patients & { users: users }) | null },
  ): AppointmentWithPatient {
    return new AppointmentWithPatient(
      record.id,
      record.appointment_datetime,
      record.status,
      record.patient_id,
      record.patients?.first_name ?? null,
      record.patients?.last_name_paternal ?? null,
      record.patients?.users?.phone ?? null,
      record.patients?.users?.email ?? null,
      record.guest_full_name,
      record.guest_first_name,
      record.guest_last_name_paternal,
      record.guest_phone,
    );
  }
}
