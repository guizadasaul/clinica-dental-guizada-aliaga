import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from '../../application/patients.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { CurrentUser } from '../../../auth/infrastructure/CurrentUserDecorator.js';
import type { AuthenticatedUser } from '../../../auth/domain/AuthenticatedUser.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { CreatePatientDto } from './dto/create-patient.dto.js';
import { UpdatePatientDto } from './dto/update-patient.dto.js';
import { CreateMedicalHistoryDto } from './dto/create-medical-history.dto.js';
import { CreateHygieneHabitsDto } from './dto/create-hygiene-habits.dto.js';
import { CreateClinicalExamDto } from './dto/create-clinical-exam.dto.js';
import { CreateOdontogramEntriesDto } from './dto/create-odontogram-entries.dto.js';
import { CreateToothProcedureDto } from './dto/create-tooth-procedure.dto.js';
import { CreateDentalExamDto } from './dto/create-dental-exam.dto.js';

@Controller('patients')
@UseGuards(SupabaseAuthGuard, RolesGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(UserRole.ODONTOLOGIST)
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
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  createPatient(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreatePatientDto,
  ) {
    return this.patientsService.createPatient(currentUser.uid, dto.userId, {
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
      lastDentistVisit: dto.lastDentistVisit
        ? new Date(dto.lastDentistVisit)
        : undefined,
      lastVisitTreatment: dto.lastVisitTreatment,
      familyHistory: dto.familyHistory,
      dni: dto.dni,
    });
  }

  @Patch(':id')
  @Roles(UserRole.ODONTOLOGIST)
  updatePatient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patientsService.updatePatient(id, {
      firstName: dto.firstName,
      lastNamePaternal: dto.lastNamePaternal,
      lastNameMaternal: dto.lastNameMaternal,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      birthPlace: dto.birthPlace,
      sex: dto.sex,
      occupation: dto.occupation,
      address: dto.address,
      phone: dto.phone,
      emergencyContactName: dto.emergencyContactName,
      emergencyContactPhone: dto.emergencyContactPhone,
      emergencyContactRelationship: dto.emergencyContactRelationship,
      consultationReason: dto.consultationReason,
      lastDentistVisit: dto.lastDentistVisit
        ? new Date(dto.lastDentistVisit)
        : undefined,
      lastVisitTreatment: dto.lastVisitTreatment,
      familyHistory: dto.familyHistory,
      dni: dto.dni,
      email: dto.email,
    });
  }

  @Post(':id/medical-history')
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.OK)
  upsertMedicalHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMedicalHistoryDto,
  ) {
    return this.patientsService.upsertMedicalHistory(id, {
      conditions: dto.conditions?.map((c) => ({
        code: c.code,
        diagnosedAt: c.diagnosedAt ? new Date(c.diagnosedAt) : undefined,
        notes: c.notes,
      })),
      otherDiseases: dto.otherDiseases,
      gestationLmpDate: dto.gestationLmpDate
        ? new Date(dto.gestationLmpDate)
        : undefined,
      anesthesiaReactions: dto.anesthesiaReactions,
      medications: dto.medications?.map((m) => ({
        drugName: m.drugName,
        dose: m.dose,
        frequency: m.frequency,
        startedAt: m.startedAt ? new Date(m.startedAt) : undefined,
      })),
    });
  }

  @Get(':id/medical-history')
  @Roles(UserRole.ODONTOLOGIST)
  findMedicalHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.findMedicalHistory(id);
  }

  @Post(':id/hygiene-habits')
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.OK)
  upsertHygieneHabits(
    @Param('id', ParseUUIDPipe) id: string,
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

  @Get(':id/hygiene-habits')
  @Roles(UserRole.ODONTOLOGIST)
  findHygieneHabits(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.findHygieneHabits(id);
  }

  @Post(':id/clinical-exams')
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  createClinicalExam(
    @Param('id', ParseUUIDPipe) id: string,
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

  @Get(':id/clinical-exams/latest')
  @Roles(UserRole.ODONTOLOGIST)
  findLatestClinicalExam(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.findLatestClinicalExam(id);
  }

  @Get(':patientId/odontogram-entries')
  @Roles(UserRole.ODONTOLOGIST)
  findOdontogramEntries(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.patientsService.findOdontogramEntries(patientId);
  }

  @Post(':patientId/odontogram-entries')
  @Roles(UserRole.ODONTOLOGIST)
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
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  createToothProcedure(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateToothProcedureDto,
  ) {
    return this.patientsService.createToothProcedure(
      patientId,
      currentUser.uid,
      {
        teeth: dto.teeth.map((t) => ({
          number: t.number,
          surfaceVestibular: t.surfaceVestibular,
          surfacePalatal: t.surfacePalatal,
          surfaceMesial: t.surfaceMesial,
          surfaceDistal: t.surfaceDistal,
          surfaceOcclusal: t.surfaceOcclusal,
        })),
        treatmentId: dto.treatmentId,
        priceCharged: dto.priceCharged,
        quantity: dto.quantity,
        procedureDate: dto.procedureDate
          ? new Date(dto.procedureDate)
          : undefined,
        notes: dto.notes,
      },
    );
  }

  @Get(':patientId/tooth-procedures')
  @Roles(UserRole.ODONTOLOGIST)
  findToothProcedures(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.patientsService.findToothProcedures(patientId);
  }

  @Post(':patientId/dental-exams')
  @Roles(UserRole.ODONTOLOGIST)
  @HttpCode(HttpStatus.CREATED)
  createDentalExam(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreateDentalExamDto,
  ) {
    return this.patientsService.createDentalExam(patientId, currentUser.uid, {
      findings: dto.findings.map((f) => ({
        diagnosisCode: f.diagnosisCode,
        toothNumbers: f.toothNumbers,
        modifierValue: f.modifierValue,
        description: f.description,
        xrayRequested: f.xrayRequested,
        notes: f.notes,
      })),
      changeReason: dto.changeReason,
      notes: dto.notes,
    });
  }

  @Get(':patientId/dental-exams')
  @Roles(UserRole.ODONTOLOGIST)
  findDentalExamVersions(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.patientsService.findDentalExamVersions(patientId);
  }

  // Antes de :examId — si no, Nest matchea "current" contra el param.
  @Get(':patientId/dental-exams/current')
  @Roles(UserRole.ODONTOLOGIST)
  findCurrentDentalExam(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.patientsService.findCurrentDentalExam(patientId);
  }

  @Get(':patientId/dental-exams/:examId')
  @Roles(UserRole.ODONTOLOGIST)
  findDentalExam(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('examId', ParseUUIDPipe) examId: string,
  ) {
    return this.patientsService.findDentalExam(patientId, examId);
  }
}
