import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionDetailService } from './session_detail.service';
import { SessionDetailController } from './session_detail.controller';
import { SessionDetail } from './entities/session_detail.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SessionDetail])],
  providers: [SessionDetailService],
  controllers: [SessionDetailController],
  exports: [SessionDetailService],
})
export class SessionDetailModule {}
