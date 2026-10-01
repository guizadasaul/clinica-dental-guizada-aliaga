/**
 * Datos fijos y contactos de la clínica que usa el chatbot (confirmados con la clínica,
 * CLI-88). El WhatsApp de la clínica es el mismo número que atiende el bot,
 * así que para hablar con una persona se deriva a los doctores.
 */

export const CLINIC_ADDRESS =
  'Edificio Guizada, 1er piso — Carmela Serruto entre Suárez Miranda y Waldo Ballivián, Quillacollo, Cochabamba, Bolivia';

export const CLINIC_HOURS = [
  'Lunes a viernes: 09:00 – 12:00 y 15:00 – 19:00',
  'Sábados: 09:00 – 12:00',
  'Domingos: cerrado',
] as const;

export const CLINIC_EMAIL = 'clinicadentalguizadaaliaga@gmail.com';

/** WhatsApp de la clínica (atendido por el asistente). El mismo de la landing. */
export const CLINIC_WHATSAPP = '+591 577 44250';

export interface DoctorContact {
  name: string;
  phone: string;
}

/**
 * Números de los doctores. Uso acordado con la clínica: en horario de atención,
 * para cancelar o cambiar una cita o hablar con una persona; fuera de horario,
 * solo ante una urgencia.
 */
export const DOCTOR_CONTACTS: readonly DoctorContact[] = [
  { name: 'Dr. Ariel Guizada', phone: '+591 674 02602' },
  { name: 'Dra. Marylu Aliaga', phone: '+591 577 29544' },
];

/** "Dr. Ariel Guizada (+591 674 02602) o Dra. Marylu Aliaga (+591 577 29544)". */
export function doctorContactsText(): string {
  return DOCTOR_CONTACTS.map((d) => `${d.name} (${d.phone})`).join(' o ');
}
