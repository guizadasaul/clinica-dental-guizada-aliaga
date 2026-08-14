import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { QuotesService } from '../../application/quotes.service.js';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard.js';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard.js';
import { Roles } from '../../../auth/infrastructure/roles.decorator.js';
import { UserRole } from '../../../auth/domain/value-objects/UserRole.js';
import { AddQuoteItemDto } from './dto/add-quote-item.dto.js';

@Controller('quotes')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ODONTOLOGIST)
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.quotesService.findById(id);
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddQuoteItemDto,
  ) {
    return this.quotesService.addItem(id, {
      treatmentId: dto.treatmentId,
      toothNumbers: dto.toothNumbers,
      customPrice: dto.customPrice,
      quantity: dto.quantity,
    });
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.quotesService.removeItem(id, itemId);
  }
}
