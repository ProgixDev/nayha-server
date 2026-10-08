import { Module } from '@nestjs/common';
import { AppLinksController } from './app-links.controller';
import { AppLinksService } from './app-links.service';

@Module({
  controllers: [AppLinksController],
  providers: [AppLinksService],
  exports: [AppLinksService],
})
export class AppLinksModule {}
