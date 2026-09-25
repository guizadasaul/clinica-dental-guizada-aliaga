import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { ChatActor } from './ChatActor';
import {
  isKnownToolName,
  isToolAllowed,
  TOOL_NAMES,
  toolsAllowedFor,
} from './toolPermissions';

const anonymous: ChatActor = { kind: 'anonymous' };

function userActor(role: UserRole): ChatActor {
  return {
    kind: 'user',
    userId: 'user-1',
    role,
    patientId: role === UserRole.PATIENT ? 'patient-1' : null,
  };
}

const PUBLIC_TOOLS = [
  'get_clinic_info',
  'get_faq',
  'list_services',
  'list_doctors',
  'get_available_slots',
];
const PATIENT_TOOLS = [
  'get_my_next_appointment',
  'get_my_appointments',
  'get_my_quotes',
  'get_my_balance',
  'get_my_treatments',
  'get_my_pending_treatments',
];
const DOCTOR_TOOLS = [
  'get_my_agenda',
  'get_my_next_patient',
  'get_my_patients',
  'get_my_monthly_stats',
];
const ADMIN_TOOLS = [
  'get_clinic_operational_report',
  'get_clinic_financial_report',
  'get_clinic_agenda',
  'get_top_treatments',
];

const sorted = (names: string[]) =>
  [...names].sort((a, b) => a.localeCompare(b));

describe('toolPermissions', () => {
  it('anonymous only gets the public tools plus the booking link', () => {
    expect(sorted(toolsAllowedFor(anonymous))).toEqual(
      sorted([...PUBLIC_TOOLS, 'get_booking_link']),
    );
  });

  it('a patient gets the public tools, the booking link and their own tools', () => {
    expect(sorted(toolsAllowedFor(userActor(UserRole.PATIENT)))).toEqual(
      sorted([...PUBLIC_TOOLS, 'get_booking_link', ...PATIENT_TOOLS]),
    );
  });

  it('an odontologist gets the public tools and their own tools, without the booking link', () => {
    expect(sorted(toolsAllowedFor(userActor(UserRole.ODONTOLOGIST)))).toEqual(
      sorted([...PUBLIC_TOOLS, ...DOCTOR_TOOLS]),
    );
  });

  it('an admin gets the public tools and the admin tools', () => {
    expect(sorted(toolsAllowedFor(userActor(UserRole.ADMIN)))).toEqual(
      sorted([...PUBLIC_TOOLS, ...ADMIN_TOOLS]),
    );
  });

  it('never gives private tools to anonymous', () => {
    for (const name of [...PATIENT_TOOLS, ...DOCTOR_TOOLS, ...ADMIN_TOOLS]) {
      expect(isToolAllowed(anonymous, name)).toBe(false);
    }
  });

  it('does not give patient tools to odontologists or admins', () => {
    for (const name of PATIENT_TOOLS) {
      expect(isToolAllowed(userActor(UserRole.ODONTOLOGIST), name)).toBe(false);
      expect(isToolAllowed(userActor(UserRole.ADMIN), name)).toBe(false);
    }
  });

  it('does not give admin tools to odontologists or patients', () => {
    for (const name of ADMIN_TOOLS) {
      expect(isToolAllowed(userActor(UserRole.ODONTOLOGIST), name)).toBe(false);
      expect(isToolAllowed(userActor(UserRole.PATIENT), name)).toBe(false);
    }
  });

  it('denies unknown tool names for every role', () => {
    for (const actor of [
      anonymous,
      userActor(UserRole.PATIENT),
      userActor(UserRole.ODONTOLOGIST),
      userActor(UserRole.ADMIN),
    ]) {
      expect(isToolAllowed(actor, 'query_database')).toBe(false);
      expect(isToolAllowed(actor, '')).toBe(false);
    }
  });

  it('does not treat inherited object properties as tool names', () => {
    expect(isKnownToolName('constructor')).toBe(false);
    expect(isKnownToolName('__proto__')).toBe(false);
    expect(isKnownToolName('toString')).toBe(false);
    expect(isToolAllowed(userActor(UserRole.ADMIN), 'constructor')).toBe(false);
  });

  it('lists every tool of the matrix exactly once', () => {
    const all = [
      ...PUBLIC_TOOLS,
      'get_booking_link',
      ...PATIENT_TOOLS,
      ...DOCTOR_TOOLS,
      ...ADMIN_TOOLS,
    ];
    expect(sorted(TOOL_NAMES)).toEqual(sorted(all));
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });
});
