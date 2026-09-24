import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { actorRole, ANONYMOUS_ROLE } from './ChatActor';
import type { ActorRole, ChatActor } from './ChatActor';

const EVERYONE = [
  ANONYMOUS_ROLE,
  UserRole.PATIENT,
  UserRole.ODONTOLOGIST,
  UserRole.ADMIN,
] as const;
const PATIENT_ONLY = [UserRole.PATIENT] as const;
const ODONTOLOGIST_ONLY = [UserRole.ODONTOLOGIST] as const;
const ADMIN_ONLY = [UserRole.ADMIN] as const;

/**
 * Matriz rol → tools (épica CLI-81): la única fuente de verdad de qué puede
 * pedir cada actor. El LLM solo recibe las tools permitidas y, además, cada
 * ejecución se vuelve a autorizar contra esta tabla. Una tool que no figura
 * acá no existe para nadie (deny by default).
 */
export const TOOL_PERMISSIONS = {
  get_clinic_info: EVERYONE,
  get_faq: EVERYONE,
  list_services: EVERYONE,
  list_doctors: EVERYONE,
  get_available_slots: EVERYONE,
  // El doctor y el admin no reservan como pacientes desde el chat.
  get_booking_link: [ANONYMOUS_ROLE, UserRole.PATIENT],

  get_my_next_appointment: PATIENT_ONLY,
  get_my_appointments: PATIENT_ONLY,
  get_my_quotes: PATIENT_ONLY,
  get_my_balance: PATIENT_ONLY,
  get_my_treatments: PATIENT_ONLY,

  get_my_agenda: ODONTOLOGIST_ONLY,
  get_my_next_patient: ODONTOLOGIST_ONLY,
  get_my_patients: ODONTOLOGIST_ONLY,
  get_my_monthly_stats: ODONTOLOGIST_ONLY,

  get_clinic_operational_report: ADMIN_ONLY,
  get_clinic_financial_report: ADMIN_ONLY,
  get_clinic_agenda: ADMIN_ONLY,
  get_top_treatments: ADMIN_ONLY,
} as const satisfies Record<string, readonly ActorRole[]>;

export type ToolName = keyof typeof TOOL_PERMISSIONS;

export const TOOL_NAMES = Object.keys(TOOL_PERMISSIONS) as ToolName[];

/** true si `name` es una tool de la matriz. Usa hasOwn para no aceptar `constructor`, `__proto__`, etc. */
export function isKnownToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_PERMISSIONS, name);
}

export function isToolAllowed(actor: ChatActor, toolName: string): boolean {
  if (!isKnownToolName(toolName)) {
    return false;
  }
  const allowed: readonly ActorRole[] = TOOL_PERMISSIONS[toolName];
  return allowed.includes(actorRole(actor));
}

export function toolsAllowedFor(actor: ChatActor): ToolName[] {
  return TOOL_NAMES.filter((name) => isToolAllowed(actor, name));
}
