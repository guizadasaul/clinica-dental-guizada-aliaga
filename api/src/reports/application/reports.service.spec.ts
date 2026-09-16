import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { ReportsRepository } from '../domain/ReportsRepository';
import type { OperationalReport } from '../domain/OperationalReport';
import type { FinancialReport } from '../domain/FinancialReport';

const mockReportsRepo = {
  getOperationalReport: jest.fn(),
  getFinancialReport: jest.fn(),
};

const OPERATIONAL_REPORT: OperationalReport = {
  from: '2026-09-01',
  to: '2026-09-07',
  doctors: [],
};

const FINANCIAL_REPORT: FinancialReport = {
  from: '2026-09-01',
  to: '2026-09-07',
  doctors: [],
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: mockReportsRepo },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  describe('getOperationalReport', () => {
    it('normalizes from/to (UTC-4, huso de la clínica) into [gte, lt) before delegating', async () => {
      mockReportsRepo.getOperationalReport.mockResolvedValue(
        OPERATIONAL_REPORT,
      );

      const result = await service.getOperationalReport({
        from: '2026-09-01',
        to: '2026-09-07',
      });

      expect(mockReportsRepo.getOperationalReport).toHaveBeenCalledWith({
        from: new Date('2026-09-01T04:00:00.000Z'),
        to: new Date('2026-09-08T04:00:00.000Z'),
      });
      expect(result).toEqual(OPERATIONAL_REPORT);
    });

    it('forwards doctorId when present', async () => {
      mockReportsRepo.getOperationalReport.mockResolvedValue(
        OPERATIONAL_REPORT,
      );

      await service.getOperationalReport({
        from: '2026-09-01',
        to: '2026-09-01',
        doctorId: 'doctor-1',
      });

      expect(mockReportsRepo.getOperationalReport).toHaveBeenCalledWith({
        from: new Date('2026-09-01T04:00:00.000Z'),
        to: new Date('2026-09-02T04:00:00.000Z'),
        doctorId: 'doctor-1',
      });
    });

    it('throws BadRequestException when from is after to', async () => {
      await expect(
        service.getOperationalReport({ from: '2026-09-10', to: '2026-09-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockReportsRepo.getOperationalReport).not.toHaveBeenCalled();
    });
  });

  describe('getFinancialReport', () => {
    it('delegates with the same normalized range', async () => {
      mockReportsRepo.getFinancialReport.mockResolvedValue(FINANCIAL_REPORT);

      const result = await service.getFinancialReport({
        from: '2026-09-01',
        to: '2026-09-07',
      });

      expect(mockReportsRepo.getFinancialReport).toHaveBeenCalledWith({
        from: new Date('2026-09-01T04:00:00.000Z'),
        to: new Date('2026-09-08T04:00:00.000Z'),
      });
      expect(result).toEqual(FINANCIAL_REPORT);
    });

    it('throws BadRequestException on an invalid range without calling the repository', async () => {
      await expect(
        service.getFinancialReport({ from: '2026-09-10', to: '2026-09-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockReportsRepo.getFinancialReport).not.toHaveBeenCalled();
    });
  });
});
