import {
  buildSlotsForDate,
  groupBlocksByWeekday,
  isValidSlot,
  WeeklySchedule,
} from './ClinicSchedule';

const MONDAY = '2026-08-17';
const SATURDAY = '2026-08-22';
const SUNDAY = '2026-08-16';

// Mismo horario que el WEEKDAY_BLOCKS hardcodeado que este módulo tenía
// antes de CLI-56 — Lun-Vie 09-12/15-19, Sáb 09-12, domingo cerrado.
const CLINIC_SCHEDULE: WeeklySchedule = groupBlocksByWeekday([
  { weekday: 1, start: '09:00', end: '12:00' },
  { weekday: 1, start: '15:00', end: '19:00' },
  { weekday: 2, start: '09:00', end: '12:00' },
  { weekday: 2, start: '15:00', end: '19:00' },
  { weekday: 3, start: '09:00', end: '12:00' },
  { weekday: 3, start: '15:00', end: '19:00' },
  { weekday: 4, start: '09:00', end: '12:00' },
  { weekday: 4, start: '15:00', end: '19:00' },
  { weekday: 5, start: '09:00', end: '12:00' },
  { weekday: 5, start: '15:00', end: '19:00' },
  { weekday: 6, start: '09:00', end: '12:00' },
]);

describe('ClinicSchedule', () => {
  describe('groupBlocksByWeekday', () => {
    it('groups multiple blocks of the same weekday together, in order', () => {
      expect(CLINIC_SCHEDULE[1]).toEqual([
        { start: '09:00', end: '12:00' },
        { start: '15:00', end: '19:00' },
      ]);
    });

    it('leaves a weekday with no blocks undefined', () => {
      expect(CLINIC_SCHEDULE[0]).toBeUndefined();
    });
  });

  describe('buildSlotsForDate', () => {
    it('returns 14 slots for a weekday (3h morning + 4h afternoon, 30min)', () => {
      const slots = buildSlotsForDate(MONDAY, CLINIC_SCHEDULE);
      expect(slots).toHaveLength(14);
    });

    it('returns no slots inside the midday gap (12:00-15:00)', () => {
      const slots = buildSlotsForDate(MONDAY, CLINIC_SCHEDULE);
      const inGap = slots.some((s) => {
        const hourUtc = new Date(s.toISOString()).getUTCHours();
        // 12:00-15:00 local (UTC-4) == 16:00-19:00 UTC
        return hourUtc >= 16 && hourUtc < 19;
      });
      expect(inGap).toBe(false);
    });

    it('returns 6 slots on Saturday (single block, 09:00-12:00)', () => {
      const slots = buildSlotsForDate(SATURDAY, CLINIC_SCHEDULE);
      expect(slots).toHaveLength(6);
    });

    it('returns no slots on a closed weekday (Sunday)', () => {
      expect(buildSlotsForDate(SUNDAY, CLINIC_SCHEDULE)).toHaveLength(0);
    });

    it('returns an empty array for a malformed date', () => {
      expect(buildSlotsForDate('not-a-date', CLINIC_SCHEDULE)).toHaveLength(0);
    });

    it('returns no slots for any date when the schedule is empty (doctor with no blocks configured)', () => {
      expect(buildSlotsForDate(MONDAY, {})).toHaveLength(0);
    });
  });

  describe('isValidSlot', () => {
    it('accepts the first slot of the weekday morning block', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T09:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(true);
    });

    it('accepts the last slot of the weekday morning block (11:30)', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T11:30:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(true);
    });

    it('accepts the last slot of the weekday afternoon block (18:30)', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T18:30:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(true);
    });

    it('rejects a time before the morning block opens', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T08:30:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects noon (12:00), the old boundary — morning now closes at 12:00', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T12:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects a time inside the midday gap', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T13:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects a time at/after closing', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T19:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects a time not aligned to the 30-minute grid', () => {
      expect(
        isValidSlot(new Date(`${MONDAY}T09:15:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects any time on a closed weekday', () => {
      expect(
        isValidSlot(new Date(`${SUNDAY}T10:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('accepts the first slot of Saturday morning', () => {
      expect(
        isValidSlot(new Date(`${SATURDAY}T09:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(true);
    });

    it('accepts the last slot of Saturday morning (11:30)', () => {
      expect(
        isValidSlot(new Date(`${SATURDAY}T11:30:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(true);
    });

    it('rejects a Saturday afternoon slot — Saturday has no afternoon block', () => {
      expect(
        isValidSlot(new Date(`${SATURDAY}T15:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects Saturday at/after its shorter closing time (12:00)', () => {
      expect(
        isValidSlot(new Date(`${SATURDAY}T12:00:00-04:00`), CLINIC_SCHEDULE),
      ).toBe(false);
    });

    it('rejects any slot when the schedule is empty (doctor with no blocks configured)', () => {
      expect(isValidSlot(new Date(`${MONDAY}T09:00:00-04:00`), {})).toBe(false);
    });
  });
});
