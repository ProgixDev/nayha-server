import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @UseGuards(AdminGuard)
  getKpis() {
    return this.dashboardService.getKpis();
  }

  @Get('activity')
  @UseGuards(AdminGuard)
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('sparklines')
  @UseGuards(AdminGuard)
  getSparklineData() {
    return this.dashboardService.getSparklineData();
  }
}
