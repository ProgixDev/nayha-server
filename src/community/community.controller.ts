import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { ReportPostDto } from './dto/report-post.dto';

@Controller('community')
@UseGuards(SupabaseJwtGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get()
  getPosts(@CurrentUser() user: AuthUser) {
    return this.communityService.getPosts(user.id);
  }

  @Post()
  createPost(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePostDto,
  ) {
    return this.communityService.createPost(user.id, dto);
  }

  @Post(':id/react')
  toggleReact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.communityService.toggleReact(user.id, id);
  }

  @Post(':id/report')
  reportPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReportPostDto,
  ) {
    return this.communityService.reportPost(user.id, id, dto);
  }
}
