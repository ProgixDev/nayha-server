export interface BlogSectionDto {
  heading?: string;
  content: string;
}

export class CreateBlogArticleDto {
  title!: string;
  subtitle!: string;
  category!: string;
  readTimeMinutes!: number;
  keyTakeaway!: string;
  exerciseTitle?: string;
  exercisePrompt?: string;
  sections!: BlogSectionDto[];
  coachTrigger!: string;
  coachMessage!: string;
  isPublished?: boolean;
}
