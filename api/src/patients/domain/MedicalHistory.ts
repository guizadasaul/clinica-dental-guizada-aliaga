export class MedicalHistory {
  constructor(
    readonly id: string,
    readonly patientId: string,
    readonly hasAllergies: boolean,
    readonly kidneyProblems: boolean,
    readonly ulcers: boolean,
    readonly rheumatism: boolean,
    readonly heartProblems: boolean,
    readonly diabetes: boolean,
    readonly hypertension: boolean,
    readonly hemorrhages: boolean,
    readonly anemia: boolean,
    readonly sti: boolean,
    readonly otherDiseases: string | null,
    readonly gestationPeriod: string | null,
    readonly anesthesiaReactions: boolean | null,
    readonly currentMedications: string | null,
    readonly updatedAt: Date,
  ) {}
}
