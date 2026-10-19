import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { BlogService } from './blog.service';
import { CreateBlogArticleDto } from './dto/create-blog-article.dto';
import { UpdateBlogArticleDto } from './dto/update-blog-article.dto';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ── Public Endpoints for Mobile App & Web ───────────────────────────────────

  @Get('articles')
  async listArticles(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    const articles = await this.blogService.list(category, search);
    return { articles };
  }

  @Get('categories')
  async getCategories() {
    const categories = await this.blogService.getCategories();
    return { categories };
  }

  @Get('articles/:id')
  async getArticle(@Param('id') id: string) {
    const article = await this.blogService.get(id);
    return { article };
  }

  @Post('articles/:id/track')
  async trackView(
    @Param('id') id: string,
    @Body() body?: { userId?: string; sessionId?: string },
  ) {
    return this.blogService.trackView(id, body?.userId, body?.sessionId);
  }

  // ── Admin Endpoints ────────────────────────────────────────────────────────

  @Get('admin/articles')
  @UseGuards(AdminGuard)
  async listAdminArticles() {
    const articles = await this.blogService.listAdmin();
    return { articles };
  }

  @Get('admin/stats')
  @UseGuards(AdminGuard)
  async getAdminStats() {
    const stats = await this.blogService.getStats();
    return { stats };
  }

  @Post('admin/articles')
  @UseGuards(AdminGuard)
  async createArticle(@Body() dto: CreateBlogArticleDto) {
    const article = await this.blogService.create(dto);
    return { article };
  }

  @Put('admin/articles/:id')
  @UseGuards(AdminGuard)
  async updateArticlePut(
    @Param('id') id: string,
    @Body() dto: UpdateBlogArticleDto,
  ) {
    const article = await this.blogService.update(id, dto);
    return { article };
  }

  @Patch('admin/articles/:id')
  @UseGuards(AdminGuard)
  async updateArticlePatch(
    @Param('id') id: string,
    @Body() dto: UpdateBlogArticleDto,
  ) {
    const article = await this.blogService.update(id, dto);
    return { article };
  }

  @Delete('admin/articles/:id')
  @UseGuards(AdminGuard)
  async deleteArticle(@Param('id') id: string) {
    return this.blogService.remove(id);
  }
}
