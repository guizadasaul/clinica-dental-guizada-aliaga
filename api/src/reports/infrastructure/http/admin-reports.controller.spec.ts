import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsService } from '../../application/reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

const DOCTOR_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

describe('AdminReportsController', () => {
  const service = {
    getOperationalReport: jest.fn(),
    getFinancialReport: jest.fn(),
  };
  const controller = new AdminReportsController(
    service as unknown as ReportsService,
  );

  beforeEach(() => jest.clearAllMocks());

  describe.each([
    ['getOperational', 'getOperationalReport'],
    ['getFinancial', 'getFinancialReport'],
  ] as const)('%s', (handler, serviceMethod) => {
    it('sin doctor agrega sobre todos (no manda doctorId)', async () => {
      service[serviceMethod].mockResolvedValue('reporte');

      await expect(controller[handler](RANGE)).resolves.toBe('reporte');
      expect(service[serviceMethod]).toHaveBeenCalledWith(RANGE);
    });

    it('con doctor filtra por él', async () => {
      await controller[handler]({ ...RANGE, doctorId: DOCTOR_ID });

      expect(service[serviceMethod]).toHaveBeenCalledWith({
        ...RANGE,
        doctorId: DOCTOR_ID,
      });
    });
  });
});

describe('ReportQueryDto', () => {
  async function invalidFields(body: Record<string, unknown>) {
    const errors = await validate(plainToInstance(ReportQueryDto, body));
    return errors.map((e) => e.property).sort();
  }

  it('acepta un rango con o sin doctor', async () => {
    await expect(invalidFields(RANGE)).resolves.toEqual([]);
    await expect(
      invalidFields({ ...RANGE, doctorId: DOCTOR_ID }),
    ).resolves.toEqual([]);
  });

  it('rechaza fechas con otro formato y un doctor que no es UUID', async () => {
    await expect(
      invalidFields({ from: '01/09/2026', to: '2026-9-30', doctorId: 'x' }),
    ).resolves.toEqual(['doctorId', 'from', 'to']);
  });
});
