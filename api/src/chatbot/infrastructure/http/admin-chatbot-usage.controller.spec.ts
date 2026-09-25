import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import { ROLES_KEY } from '../../../auth/infrastructure/roles.decorator';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard';
import type { ChatUsageService } from '../../application/chat-usage.service';
import { AdminChatbotUsageController } from './admin-chatbot-usage.controller';
import { ChatUsageQueryDto } from './dto/chat-usage-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('AdminChatbotUsageController', () => {
  it('es solo para el admin, con token y rol verificados', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminChatbotUsageController)).toEqual(
      [UserRole.ADMIN],
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminChatbotUsageController),
    ).toEqual([SupabaseAuthGuard, RolesGuard]);
  });

  it('delega el rango en ChatUsageService', async () => {
    const report = { from: 'a', to: 'b', rows: [], totals: {}, notes: [] };
    const usageService = { getUsage: jest.fn().mockResolvedValue(report) };
    const controller = new AdminChatbotUsageController(
      usageService as unknown as ChatUsageService,
    );

    await expect(
      controller.getUsage({ from: '2026-09-01', to: '2026-09-30' }),
    ).resolves.toBe(report);
    expect(usageService.getUsage).toHaveBeenCalledWith(
      '2026-09-01',
      '2026-09-30',
    );
  });

  it.each([
    [{ from: '2026-09-01', to: '2026-09-30' }, []],
    [{ from: '01/09/2026', to: '2026-09-30' }, ['from']],
    [{ from: '2026-09-01' }, ['to']],
  ])('valida el query %p', async (query, invalid) => {
    const errors = await validate(plainToInstance(ChatUsageQueryDto, query));
    expect(errors.map((e) => e.property)).toEqual(invalid);
  });
});
