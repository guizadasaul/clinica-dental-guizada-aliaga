import type { appointments } from '@prisma/client';
import { Appointment } from '../../domain/Appointment.js';

export class AppointmentMapper {
  static toDomain(record: appointments): Appointment {
    return new Appointment(
      record.id,
      record.user_id,
      record.patient_id,
      record.treatment_id,
      record.appointment_datetime,
      record.status,
      record.source,
      record.guest_full_name,
      record.guest_phone,
      record.hold_expires_at,
      record.notes,
      record.created_at,
    );
  }
}
