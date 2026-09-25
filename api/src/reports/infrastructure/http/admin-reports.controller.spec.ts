import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminReportsController } from './admin-reports.controller';
import { ReportsService } from '../../application/reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { TopTreatmentsQueryDto } from './dto/top-treatments-query.dto';

const DOCTOR_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const RANGE = { from: '2026-09-01', to: '2026-09-30' };

describe('AdminReportsController', () => {
  const service = {
    getOperationalReport: jest.fn(),
    getFinancialReport: jest.fn(),
    getTopTreatments: jest.fn(),
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
  describe('getTopTreatments (CLI-93)', () => {
    it('usa 10 por defecto y sin doctor agrega sobre todos', async () => {
      service.getTopTreatments.mockResolvedValue('top');

      await expect(controller.getTopTreatments(RANGE)).resolves.toBe('top');
      expect(service.getTopTreatments).toHaveBeenCalledWith({
        ...RANGE,
        limit: 10,
      });
    });

    it('pasa el límite y el doctor pedidos', async () => {
      await controller.getTopTreatments({
        ...RANGE,
        limit: 3,
        doctorId: DOCTOR_ID,
      });

      expect(service.getTopTreatments).toHaveBeenCalledWith({
        ...RANGE,
        limit: 3,
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

describe('TopTreatmentsQueryDto', () => {
  it('convierte el límite del query string a número', async () => {
    const dto = plainToInstance(TopTreatmentsQueryDto, {
      ...RANGE,
      limit: '5',
    });

    expect(dto.limit).toBe(5);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rechaza un límite fuera de rango', async () => {
    const dto = plainToInstance(TopTreatmentsQueryDto, {
      ...RANGE,
      limit: '50',
    });

    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['limit']);
  });
});
