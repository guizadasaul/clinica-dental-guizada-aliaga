import {
  assertTeethMatchScope,
  InvalidScopeApplicationError,
  scopeGeneratesOdontogramEntries,
  teethForScope,
  UPPER_ARCH_FDI,
  LOWER_ARCH_FDI,
  FULL_MOUTH_FDI,
} from './TreatmentScope';

describe('teethForScope', () => {
  it('returns the upper arch for upper_arch', () => {
    expect(teethForScope('upper_arch')).toEqual(UPPER_ARCH_FDI);
  });

  it('returns the lower arch for lower_arch', () => {
    expect(teethForScope('lower_arch')).toEqual(LOWER_ARCH_FDI);
  });

  it('returns all 32 teeth for full_mouth', () => {
    expect(teethForScope('full_mouth')).toEqual(FULL_MOUTH_FDI);
    expect(teethForScope('full_mouth')).toHaveLength(32);
  });

  it.each(['tooth', 'multi_tooth', 'none'] as const)(
    'returns an empty list for %s',
    (scope) => {
      expect(teethForScope(scope)).toEqual([]);
    },
  );
});

describe('scopeGeneratesOdontogramEntries', () => {
  it.each(['upper_arch', 'lower_arch', 'full_mouth'] as const)(
    'is true for %s',
    (scope) => {
      expect(scopeGeneratesOdontogramEntries(scope)).toBe(true);
    },
  );

  it.each(['tooth', 'multi_tooth', 'none'] as const)(
    'is false for %s',
    (scope) => {
      expect(scopeGeneratesOdontogramEntries(scope)).toBe(false);
    },
  );
});

describe('assertTeethMatchScope', () => {
  it('accepts exactly one tooth for scope tooth', () => {
    expect(() => assertTeethMatchScope('tooth', [16])).not.toThrow();
  });

  it('rejects zero or 2+ teeth for scope tooth', () => {
    expect(() => assertTeethMatchScope('tooth', [])).toThrow(
      InvalidScopeApplicationError,
    );
    expect(() => assertTeethMatchScope('tooth', [16, 17])).toThrow(
      InvalidScopeApplicationError,
    );
  });

  it('accepts 2+ teeth for scope multi_tooth', () => {
    expect(() =>
      assertTeethMatchScope('multi_tooth', [16, 17, 18]),
    ).not.toThrow();
  });

  it('rejects 0 or 1 tooth for scope multi_tooth', () => {
    expect(() => assertTeethMatchScope('multi_tooth', [])).toThrow(
      InvalidScopeApplicationError,
    );
    expect(() => assertTeethMatchScope('multi_tooth', [16])).toThrow(
      InvalidScopeApplicationError,
    );
  });

  it.each(['upper_arch', 'lower_arch', 'full_mouth', 'none'] as const)(
    'accepts an empty list for %s',
    (scope) => {
      expect(() => assertTeethMatchScope(scope, [])).not.toThrow();
    },
  );

  it.each(['upper_arch', 'lower_arch', 'full_mouth', 'none'] as const)(
    'rejects any tooth for %s',
    (scope) => {
      expect(() => assertTeethMatchScope(scope, [16])).toThrow(
        InvalidScopeApplicationError,
      );
    },
  );

  it('rejects a repeated tooth number', () => {
    expect(() => assertTeethMatchScope('multi_tooth', [16, 16, 17])).toThrow(
      InvalidScopeApplicationError,
    );
  });
});
