export class HygieneHabits {
  constructor(
    readonly id: string,
    readonly patientId: string,
    readonly usesToothbrush: boolean,
    readonly brushingFrequency: string | null,
    readonly usesDentalFloss: boolean,
    readonly usesToothpick: boolean,
    readonly brushesTongue: boolean,
    readonly usesMouthwash: boolean,
    readonly updatedAt: Date,
  ) {}
}
