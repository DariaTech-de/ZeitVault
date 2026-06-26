import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  imports: [AuditModule],
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class ProjectModule {}
