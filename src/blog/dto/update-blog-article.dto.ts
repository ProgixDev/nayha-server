import { BlogSectionDto } from './create-blog-article.dto';

export class UpdateBlogArticleDto {
  title?: string;
  subtitle?: string;
  category?: string;
  readTimeMinutes?: number;
  keyTakeaway?: string;
  exerciseTitle?: string;
  exercisePrompt?: string;
  sections?: BlogSectionDto[];
  coachTrigger?: string;
  coachMessage?: string;
  isPublished?: boolean;
  authorName?: string;
  authorRole?: string;
  authorAvatarUrl?: string;
  coverImageUrl?: string;
}
