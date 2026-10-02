import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CompleteCoachingSessionDto } from './dto/complete-coaching-session.dto';
import { SendCoachingMessageDto } from './dto/send-coaching-message.dto';
import { StartCoachingSessionDto } from './dto/start-coaching-session.dto';
import { UpdateCoachingCommitmentDto } from './dto/update-coaching-commitment.dto';
import { CoachingService } from './coaching.service';

@Controller('coaching')
@UseGuards(SupabaseJwtGuard)
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  @Post('sessions')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartCoachingSessionDto) {
    return this.coachingService.start(user.id, dto);
  }

  @Get('sessions')
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.coachingService.list(user.id, page, pageSize);
  }

  @Get('offer')
  offer(@CurrentUser() user: AuthUser) {
    return this.coachingService.getOffer(user.id);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthUser) {
    return this.coachingService.getSuggestions(user.id);
  }

  @Get('sessions/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.coachingService.get(user.id, id);
  }

  @Delete('sessions/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.coachingService.remove(user.id, id);
  }

  @Post('sessions/:id/messages')
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendCoachingMessageDto,
  ) {
    return this.coachingService.sendMessage(user.id, id, dto.text);
  }

  @Post('sessions/:id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteCoachingSessionDto,
  ) {
    return this.coachingService.complete(user.id, id, dto);
  }

  @Patch('sessions/:id/commitment')
  updateCommitment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCoachingCommitmentDto,
  ) {
    return this.coachingService.updateCommitment(user.id, id, dto.status);
  }
}
