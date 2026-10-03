import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SupabaseJwtGuard } from '../auth/guards/supabase-jwt.guard';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReportPostDto } from './dto/report-post.dto';

@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ── Mobile App Endpoints (User Protected) ───────────────────────────────────

  @Get()
  @UseGuards(SupabaseJwtGuard)
  getPosts(@CurrentUser() user: AuthUser) {
    return this.communityService.getPosts(user.id);
  }

  @Get('user-count')
  getUserCount() {
    return this.communityService.getUserCount();
  }

  @Post()
  @UseGuards(SupabaseJwtGuard)
  createPost(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePostDto,
  ) {
    return this.communityService.createPost(user.id, dto);
  }

  @Post(':id/react')
  @UseGuards(SupabaseJwtGuard)
  toggleReact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.communityService.toggleReact(user.id, id);
  }

  @Post(':id/report')
  @UseGuards(SupabaseJwtGuard)
  reportPost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReportPostDto,
  ) {
    return this.communityService.reportPost(user.id, id, dto);
  }

  // ── Comments / Replies Endpoints ───────────────────────────────────────────

  @Get('posts/:id/comments')
  @UseGuards(SupabaseJwtGuard)
  async getComments(@Param('id') id: string) {
    const comments = await this.communityService.getComments(id);
    return { comments };
  }

  @Post('posts/:id/comments')
  @UseGuards(SupabaseJwtGuard)
  async createComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    const comment = await this.communityService.createComment(user.id, id, dto);
    return { comment };
  }

  // ── Admin Dashboard Endpoints ───────────────────────────────────────────────

  @Get('admin/posts')
  async getAdminPosts() {
    const posts = await this.communityService.getAdminPosts();
    return { posts };
  }

  @Get('admin/reports')
  async getAdminReports() {
    const reports = await this.communityService.getAdminReports();
    return { reports };
  }

  @Put('admin/posts/:id/moderate')
  async moderatePost(
    @Param('id') id: string,
    @Body() body?: { is_moderated?: boolean },
  ) {
    const post = await this.communityService.moderatePost(id, body?.is_moderated);
    return { post };
  }

  @Delete('admin/posts/:id')
  async deletePost(@Param('id') id: string) {
    return this.communityService.deletePost(id);
  }
}
