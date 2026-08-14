export const TREATMENT_SCOPES = [
  'tooth',
  'multi_tooth',
  'upper_arch',
  'lower_arch',
  'full_mouth',
  'none',
] as const;

export type TreatmentScope = (typeof TREATMENT_SCOPES)[number];

export const TREATMENT_CURRENCIES = ['BOB', 'USD'] as const;

export type TreatmentCurrency = (typeof TREATMENT_CURRENCIES)[number];
