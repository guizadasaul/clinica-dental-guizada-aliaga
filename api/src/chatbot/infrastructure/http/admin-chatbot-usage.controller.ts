import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { ChatUsageService } from '../../application/chat-usage.service.js';
import type { ChatUsageReport } from '../../application/chat-usage.service.js';
import { ChatUsageQueryDto } from './dto/chat-usage-query.dto.js';

/** Métricas de uso del chatbot, solo para el admin (CLI-98). */
@Controller('admin/chatbot')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminChatbotUsageController {
  constructor(private readonly usageService: ChatUsageService) {}

  @Get('usage')
  getUsage(@Query() query: ChatUsageQueryDto): Promise<ChatUsageReport> {
    return this.usageService.getUsage(query.from, query.to);
  }
}
