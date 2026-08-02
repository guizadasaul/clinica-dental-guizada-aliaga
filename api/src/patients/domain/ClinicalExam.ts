export class ClinicalExam {
  constructor(
    readonly id: string,
    readonly patientId: string,
    readonly tartar: boolean,
    readonly saburra: boolean,
    readonly bacterialPlaque: boolean,
    readonly halitosis: boolean,
    readonly occlusion: string | null,
    readonly examDate: Date,
    readonly createdAt: Date,
  ) {}
}
