import {
  assertTeethMatchApplicationType,
  InvalidApplicationTypeError,
  teethForApplicationType,
  typeAllowsQuantity,
  typeGeneratesOdontogramEntries,
  typeImpliesTeeth,
  UPPER_ARCH_FDI,
  LOWER_ARCH_FDI,
  FULL_MOUTH_FDI,
} from './TreatmentApplicationType';

const NO_TEETH_TYPES = [
  'general',
  'soft_tissue',
  'frenulum',
  'prosthesis',
  'orthodontic',
  'unit',
  'box',
] as const;

describe('teethForApplicationType', () => {
  it('returns the upper arch for upper_arch', () => {
    expect(teethForApplicationType('upper_arch')).toEqual(UPPER_ARCH_FDI);
  });

  it('returns the lower arch for lower_arch', () => {
    expect(teethForApplicationType('lower_arch')).toEqual(LOWER_ARCH_FDI);
  });

  it('returns all 32 teeth for full_mouth', () => {
    expect(teethForApplicationType('full_mouth')).toEqual(FULL_MOUTH_FDI);
    expect(teethForApplicationType('full_mouth')).toHaveLength(32);
  });

  it.each(['single_tooth', 'multiple_teeth', ...NO_TEETH_TYPES] as const)(
    'returns an empty list for %s',
    (type) => {
      expect(teethForApplicationType(type)).toEqual([]);
    },
  );
});

describe('typeGeneratesOdontogramEntries', () => {
  it.each(['upper_arch', 'lower_arch', 'full_mouth'] as const)(
    'is true for %s',
    (type) => {
      expect(typeGeneratesOdontogramEntries(type)).toBe(true);
    },
  );

  it.each(['single_tooth', 'multiple_teeth', ...NO_TEETH_TYPES] as const)(
    'is false for %s',
    (type) => {
      expect(typeGeneratesOdontogramEntries(type)).toBe(false);
    },
  );
});

describe('typeImpliesTeeth / typeAllowsQuantity', () => {
  it.each([
    'single_tooth',
    'multiple_teeth',
    'upper_arch',
    'lower_arch',
    'full_mouth',
  ] as const)('%s implies teeth and does not allow quantity', (type) => {
    expect(typeImpliesTeeth(type)).toBe(true);
    expect(typeAllowsQuantity(type)).toBe(false);
  });

  it.each(NO_TEETH_TYPES)(
    '%s does not imply teeth and allows quantity',
    (type) => {
      expect(typeImpliesTeeth(type)).toBe(false);
      expect(typeAllowsQuantity(type)).toBe(true);
    },
  );
});

describe('assertTeethMatchApplicationType', () => {
  it('accepts exactly one tooth for single_tooth', () => {
    expect(() =>
      assertTeethMatchApplicationType('single_tooth', [16]),
    ).not.toThrow();
  });

  it('rejects zero or 2+ teeth for single_tooth', () => {
    expect(() => assertTeethMatchApplicationType('single_tooth', [])).toThrow(
      InvalidApplicationTypeError,
    );
    expect(() =>
      assertTeethMatchApplicationType('single_tooth', [16, 17]),
    ).toThrow(InvalidApplicationTypeError);
  });

  it('accepts 1+ teeth for multiple_teeth', () => {
    expect(() =>
      assertTeethMatchApplicationType('multiple_teeth', [16]),
    ).not.toThrow();
    expect(() =>
      assertTeethMatchApplicationType('multiple_teeth', [16, 17, 18]),
    ).not.toThrow();
  });

  it('rejects zero teeth for multiple_teeth', () => {
    expect(() => assertTeethMatchApplicationType('multiple_teeth', [])).toThrow(
      InvalidApplicationTypeError,
    );
  });

  it.each([
    'upper_arch',
    'lower_arch',
    'full_mouth',
    ...NO_TEETH_TYPES,
  ] as const)('accepts an empty list for %s', (type) => {
    expect(() => assertTeethMatchApplicationType(type, [])).not.toThrow();
  });

  it.each([
    'upper_arch',
    'lower_arch',
    'full_mouth',
    ...NO_TEETH_TYPES,
  ] as const)('rejects any tooth for %s', (type) => {
    expect(() => assertTeethMatchApplicationType(type, [16])).toThrow(
      InvalidApplicationTypeError,
    );
  });

  it('rejects a repeated tooth number', () => {
    expect(() =>
      assertTeethMatchApplicationType('multiple_teeth', [16, 16, 17]),
    ).toThrow(InvalidApplicationTypeError);
  });
});
