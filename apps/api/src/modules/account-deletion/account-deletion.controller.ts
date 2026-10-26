import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AccountDeletionService } from './account-deletion.service.js';

@Controller('account/deletion')
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}
  @Get('capabilities') capabilities() { return this.deletion.capabilities(); }
  @Get() status(@Req() req: Request) { return this.deletion.status(req.headers); }
  @Post() request(@Req() req: Request, @Body() body: unknown) { return this.deletion.request(req.headers, body); }
  @Post('cancel') cancel(@Req() req: Request, @Body() body: unknown) { return this.deletion.cancel(req.headers, body); }
}
