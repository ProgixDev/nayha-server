import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis() {
    return this.dashboardService.getKpis();
  }

  @Get('activity')
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('sparklines')
  getSparklineData() {
    return this.dashboardService.getSparklineData();
  }
}
