import {
  CLINIC_WHATSAPP,
  DOCTOR_CONTACTS,
  doctorContactsText,
} from '../../domain/ClinicContacts.js';

/**
 * Conocimiento estático de la clínica para el chatbot (CLI-88). Es chico a
 * propósito: por eso no hay RAG (decisión de CLI-94).
 *
 * Espejo de frontend/public/assets/i18n/es.json > landing.contact y de los
 * links de contacto de landing.html — cambiar los dos juntos.
 */
export const CLINIC_INFO = {
  name: 'Clínica Dental Guizada Aliaga',
  address:
    'Edificio Guizada, 1er piso — Carmela Serruto entre Suárez Miranda y Waldo Ballivián',
  city: 'Quillacollo, Cochabamba, Bolivia',
  hours: [
    'Lunes a viernes: 09:00 – 12:00 y 15:00 – 19:00',
    'Sábados: 09:00 – 12:00',
    'Domingos: cerrado',
  ],
  hoursNote:
    'Es el horario general; cada doctor tiene su propia agenda. Para horarios libres reales, consultar la disponibilidad.',
  whatsapp: CLINIC_WHATSAPP,
  whatsappNote: 'Es el WhatsApp de la clínica, atendido por este asistente.',
  email: 'clinicadentalguizadaaliaga@gmail.com',
  doctorContacts: DOCTOR_CONTACTS,
  doctorContactsNote:
    'En horario de atención: para cancelar o cambiar una cita o hablar con una persona. Fuera de horario: solo urgencias.',
} as const;

export const FAQ_TOPICS = [
  'reservas',
  'pagos',
  'primera_consulta',
  'ubicacion',
  'general',
] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];

export interface FaqEntry {
  topic: FaqTopic;
  question: string;
  answer: string;
}

/**
 * FAQ inicial, basada solo en cómo funciona hoy el sistema. Validarla con la
 * clínica antes de ampliarla: el asistente la repite tal cual.
 */
export const CLINIC_FAQ: readonly FaqEntry[] = [
  {
    topic: 'reservas',
    question: '¿Cómo reservo una cita?',
    answer:
      'Desde la web: eliges doctor y horario libre, completas tus datos y confirmas con un pago por QR. También puedes pedirle al asistente los horarios disponibles y te da el link para reservar.',
  },
  {
    topic: 'reservas',
    question: '¿Cuánto tiempo tengo para completar la reserva?',
    answer:
      'El horario elegido queda apartado por 10 minutos mientras completas tus datos y el pago. Si vence, el horario se libera y puedes elegir otro.',
  },
  {
    topic: 'reservas',
    question: '¿Puedo cancelar o cambiar mi cita?',
    answer: `Por ahora las cancelaciones y los cambios de horario se coordinan con los doctores, escribiendo en horario de atención a ${doctorContactsText()}.`,
  },
  {
    topic: 'pagos',
    question: '¿Cómo pago la consulta?',
    answer:
      'La reserva online se confirma con un pago por QR desde tu app bancaria. La confirmación llega sola apenas se acredita el pago.',
  },
  {
    topic: 'pagos',
    question: '¿Los precios de los tratamientos son fijos?',
    answer:
      'Los precios que muestra el asistente son precios base referenciales. El costo final de un tratamiento se define en el presupuesto que arma el doctor después de la evaluación.',
  },
  {
    topic: 'pagos',
    question: '¿Qué medios de pago aceptan?',
    answer:
      'En la clínica aceptamos efectivo, QR y transferencia bancaria. La primera consulta se paga solo por QR, al reservar online.',
  },
  {
    topic: 'pagos',
    question: '¿Trabajan con seguros médicos?',
    answer: 'No, por el momento no trabajamos con seguros médicos.',
  },
  {
    topic: 'general',
    question: '¿Atienden a niños?',
    answer: `Sí, atendemos a niños desde los 5 años. Para un caso puntual de un niño menor, consulta en horario de atención a ${doctorContactsText()}.`,
  },
  {
    topic: 'primera_consulta',
    question: '¿Qué pasa en la primera consulta?',
    answer:
      'El doctor revisa tu historia clínica y hace un examen dental. Con eso te propone un plan de tratamiento y un presupuesto.',
  },
  {
    topic: 'primera_consulta',
    question: '¿Necesito crear una cuenta para reservar?',
    answer:
      'No. Puedes reservar como invitado. Después la clínica puede enviarte una invitación para crear tu acceso a la web.',
  },
  {
    topic: 'ubicacion',
    question: '¿Dónde queda la clínica?',
    answer: `${CLINIC_INFO.address}, ${CLINIC_INFO.city}.`,
  },
  {
    topic: 'general',
    question: '¿Cómo contacto a la clínica?',
    answer: `Este WhatsApp (${CLINIC_INFO.whatsapp}) es el asistente de la clínica. Para hablar con una persona, en horario de atención: ${doctorContactsText()}. También por correo a ${CLINIC_INFO.email}.`,
  },
  {
    topic: 'general',
    question: '¿Qué hago ante una urgencia fuera de horario?',
    answer: `Si tienes una urgencia (sangrado que no para, golpe fuerte, hinchazón con fiebre, dolor intenso), escribe a ${doctorContactsText()}. Si es grave, acude a un servicio de emergencias.`,
  },
];
