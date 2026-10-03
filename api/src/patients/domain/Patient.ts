import type { PhoneLoginError } from '../../auth/domain/value-objects/PhoneLoginError';

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
    readonly emergencyContactFirstName: string | null,
    readonly emergencyContactLastName: string | null,
    readonly emergencyContactPhone: string | null,
    readonly emergencyContactRelationship: string | null,
    readonly consultationReason: string | null,
    readonly lastDentistVisit: Date | null,
    readonly lastVisitTreatment: string | null,
    readonly familyHistory: string | null,
    /** CI/pasaporte/nit (CLI-54) — junto con dni forman la clave única real, ver DOCUMENT_TYPES. null solo si dni también es null. */
    readonly documentType: string | null,
    /** Número del documento; la extensión de la CI va dentro con guion (CLI-177). */
    readonly dni: string | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
    /** Doctor asignado (CLI-58) — informativo, no restringe acceso a la ficha. */
    readonly assignedDoctorId: string | null,
    /**
     * Por qué el teléfono no quedó habilitado como login (CLI-143) — vive en
     * users.phone_login_error, igual que el teléfono vive en users.phone.
     */
    readonly phoneLoginError: PhoneLoginError | null = null,
  ) {}
}
