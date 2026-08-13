import { buildSlotsForDate, isValidSlot } from './ClinicSchedule';

const MONDAY = '2026-08-17';
const SUNDAY = '2026-08-16';

describe('ClinicSchedule', () => {
  describe('buildSlotsForDate', () => {
    it('returns 16 slots for a weekday (2 blocks x 4h x 30min)', () => {
      const slots = buildSlotsForDate(MONDAY);
      expect(slots).toHaveLength(16);
    });

    it('returns no slots inside the lunch gap (13:00-15:00)', () => {
      const slots = buildSlotsForDate(MONDAY);
      const inGap = slots.some((s) => {
        const hourUtc = new Date(s.toISOString()).getUTCHours();
        // 13:00-15:00 local (UTC-4) == 17:00-19:00 UTC
        return hourUtc >= 17 && hourUtc < 19;
      });
      expect(inGap).toBe(false);
    });

    it('returns no slots on a closed weekday (Sunday)', () => {
      expect(buildSlotsForDate(SUNDAY)).toHaveLength(0);
    });

    it('returns an empty array for a malformed date', () => {
      expect(buildSlotsForDate('not-a-date')).toHaveLength(0);
    });
  });

  describe('isValidSlot', () => {
    it('accepts the first slot of the morning block', () => {
      expect(isValidSlot(new Date(`${MONDAY}T09:00:00-04:00`))).toBe(true);
    });

    it('accepts the last slot of the afternoon block', () => {
      expect(isValidSlot(new Date(`${MONDAY}T18:30:00-04:00`))).toBe(true);
    });

    it('rejects a time before the morning block opens', () => {
      expect(isValidSlot(new Date(`${MONDAY}T08:30:00-04:00`))).toBe(false);
    });

    it('rejects a time inside the lunch gap', () => {
      expect(isValidSlot(new Date(`${MONDAY}T13:00:00-04:00`))).toBe(false);
    });

    it('rejects a time at/after closing', () => {
      expect(isValidSlot(new Date(`${MONDAY}T19:00:00-04:00`))).toBe(false);
    });

    it('rejects a time not aligned to the 30-minute grid', () => {
      expect(isValidSlot(new Date(`${MONDAY}T09:15:00-04:00`))).toBe(false);
    });

    it('rejects any time on a closed weekday', () => {
      expect(isValidSlot(new Date(`${SUNDAY}T10:00:00-04:00`))).toBe(false);
    });
  });
});
