import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from '../../application/patients.service.js';
import { FirebaseAuthGuard } from '../../../auth/infrastructure/FirebaseAuthGuard.js';
import { CurrentUser } from '../../../auth/infrastructure/CurrentUserDecorator.js';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';
import { CreateMedicalHistoryDto } from './dto/create-medical-history.dto.js';
import { CreateHygieneHabitsDto } from './dto/create-hygiene-habits.dto.js';
import { CreateClinicalExamDto } from './dto/create-clinical-exam.dto.js';
import { CreateOdontogramEntriesDto } from './dto/create-odontogram-entries.dto.js';
import { CreateToothProcedureDto } from './dto/create-tooth-procedure.dto.js';

@Controller('patients')
@UseGuards(FirebaseAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll() {
    return this.patientsService.findAll();
  }

  @Get('me')
  getMyPatient(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.patientsService.findMyPatient(currentUser.uid);
  }

  @Get('me/status')
  getMyPatientStatus(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.patientsService.findMyPatientStatus(currentUser.uid);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createPatient(@Body() dto: CreatePatientDto) {
    return this.patientsService.createPatient(dto.userId, {
      firstName: dto.firstName,
      lastNamePaternal: dto.lastNamePaternal,
      lastNameMaternal: dto.lastNameMaternal,
      birthDate: new Date(dto.birthDate),
      birthPlace: dto.birthPlace,
      sex: dto.sex,
      occupation: dto.occupation,
      address: dto.address,
      phone: dto.phone,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      emergencyContactRelationship: dto.emergencyContactRelationship,
      consultationReason: dto.consultationReason,
      lastDentistVisit: dto.lastDentistVisit ? new Date(dto.lastDentistVisit) : undefined,
      lastVisitTreatment: dto.lastVisitTreatment,
      familyHistory: dto.familyHistory,
      dni: dto.dni,
    });
  }

  @Post(':id/medical-history')
  @HttpCode(HttpStatus.OK)
  upsertMedicalHistory(
    @Param('id') id: string,
    @Body() dto: CreateMedicalHistoryDto,
  ) {
    return this.patientsService.upsertMedicalHistory(id, {
      hasAllergies: dto.hasAllergies,
      kidneyProblems: dto.kidneyProblems,
      ulcers: dto.ulcers,
      rheumatism: dto.rheumatism,
      heartProblems: dto.heartProblems,
      diabetes: dto.diabetes,
      hypertension: dto.hypertension,
      hemorrhages: dto.hemorrhages,
      anemia: dto.anemia,
      sti: dto.sti,
      otherDiseases: dto.otherDiseases,
      gestationPeriod: dto.gestationPeriod,
      anesthesiaReactions: dto.anesthesiaReactions,
      currentMedications: dto.currentMedications,
    });
  }

  @Post(':id/hygiene-habits')
  @HttpCode(HttpStatus.OK)
  upsertHygieneHabits(
    @Param('id') id: string,
    @Body() dto: CreateHygieneHabitsDto,
  ) {
    return this.patientsService.upsertHygieneHabits(id, {
      usesToothbrush: dto.usesToothbrush,
      brushingFrequency: dto.brushingFrequency,
      usesDentalFloss: dto.usesDentalFloss,
      usesToothpick: dto.usesToothpick,
      brushesTongue: dto.brushesTongue,
      usesMouthwash: dto.usesMouthwash,
    });
  }

  @Post(':id/clinical-exams')
  @HttpCode(HttpStatus.CREATED)
  createClinicalExam(
    @Param('id') id: string,
    @Body() dto: CreateClinicalExamDto,
  ) {
    return this.patientsService.createClinicalExam(id, {
      tartar: dto.tartar,
      saburra: dto.saburra,
      bacterialPlaque: dto.bacterialPlaque,
      halitosis: dto.halitosis,
      occlusion: dto.occlusion,
    });
  }

  @Get(':patientId/odontogram-entries')
  findOdontogramEntries(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.patientsService.findOdontogramEntries(patientId);
  }

  @Post(':patientId/odontogram-entries')
  @HttpCode(HttpStatus.CREATED)
  createOdontogramEntries(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateOdontogramEntriesDto,
  ) {
    return this.patientsService.createOdontogramEntries(
      patientId,
      dto.entries.map((e) => ({
        toothNumber: e.toothNumber,
        toothType: e.toothType,
        diagnosisType: e.diagnosisType,
        toothCondition: e.toothCondition,
        diagnosisDescription: e.diagnosisDescription,
        xrayRequested: e.xrayRequested,
        treatmentId: e.treatmentId,
        customPrice: e.customPrice,
        notes: e.notes,
      })),
    );
  }

  @Post(':patientId/tooth-procedures')
  @HttpCode(HttpStatus.CREATED)
  createToothProcedure(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateToothProcedureDto,
  ) {
    return this.patientsService.createToothProcedure(patientId, currentUser.uid, {
      toothNumber: dto.toothNumber,
      treatmentId: dto.treatmentId,
      priceCharged: dto.priceCharged,
      procedureDate: dto.procedureDate ? new Date(dto.procedureDate) : undefined,
      surfaceVestibular: dto.surfaceVestibular,
      surfacePalatal: dto.surfacePalatal,
      surfaceMesial: dto.surfaceMesial,
      surfaceDistal: dto.surfaceDistal,
      surfaceOcclusal: dto.surfaceOcclusal,
      notes: dto.notes,
    });
  }

  @Get(':patientId/tooth-procedures')
  findToothProcedures(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.patientsService.findToothProcedures(patientId);
  }
}
