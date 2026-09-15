export class Patient {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly firstName: string,
    readonly lastNamePaternal: string,
    readonly lastNameMaternal: string | null,
    readonly birthDate: Date | null,
    readonly birthPlace: string | null,
    readonly sex: string | null,
    readonly occupation: string | null,
    /** Resto de la dirección (calle, número, referencias) — zona/ciudad viven en sus propios campos, ver abajo (CLI-54). */
    readonly address: string | null,
    readonly zona: string | null,
    readonly ciudad: string | null,
    readonly phone: string | null,
    readonly emergencyContactName: string | null,
    readonly emergencyContactPhone: string | null,
    readonly emergencyContactRelationship: string | null,
    readonly consultationReason: string | null,
    readonly lastDentistVisit: Date | null,
    readonly lastVisitTreatment: string | null,
    readonly familyHistory: string | null,
    /** CI/pasaporte/nit (CLI-54) — junto con dni forman la clave única real, ver DOCUMENT_TYPES. null solo si dni también es null. */
    readonly documentType: string | null,
    readonly dni: string | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}
}
