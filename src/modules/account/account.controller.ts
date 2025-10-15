import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  Delete,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { ContactSupportDto } from './dto/contact-support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Account')
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @ApiOperation({ summary: 'Contact support' })
  @Post('support')
  async contactSupport(@GetUser() user, @Body() dto: ContactSupportDto) {
    return this.accountService.contactSupport(user.userId, dto);
  }

  @Get('support')
  async listMySupport(@GetUser() user) {
    return this.accountService.listSupportTickets(user.userId);
  }

  @Get('support/:ticketId')
  async getMySupport(@GetUser() user, @Param('ticketId') ticketId: string) {
    return this.accountService.getSupportTicket(user.userId, ticketId);
  }

  @Patch('support/:ticketId/:status')
  async updateSupportStatus(
    @GetUser() user,
    @Param('ticketId') ticketId: string,
    @Param('status') status: 'OPEN' | 'CLOSED' | 'RESOLVED',
  ) {
    return this.accountService.updateSupportTicketStatus(
      user.userId,
      ticketId,
      status,
    );
  }

  @ApiOperation({ summary: 'Send Feedback' })
  @Post('feedback')
  async sendFeedback(@GetUser() user, @Body() dto: { feedback: string }) {
    return this.accountService.sendFeedback(user.userId, dto);
  }

  @ApiOperation({ summary: 'Delete my account (soft delete & anonymize)' })
  @Delete('me')
  async deleteAccount(@GetUser() user) {
    return this.accountService.deleteAccount(user.userId);
  }
}
