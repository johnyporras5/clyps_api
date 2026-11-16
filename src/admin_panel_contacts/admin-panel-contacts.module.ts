import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { PanelContactLog } from './entities/panel-contact-log.entity';
import { PanelContactsController } from './panel-contacts.controller';
import { PanelContactsService } from './panel-contacts.service';

/** Seguimiento de a quién se le escribió desde el panel. No afecta al salón. */
@Module({
  imports: [TypeOrmModule.forFeature([PanelContactLog, User])],
  controllers: [PanelContactsController],
  providers: [PanelContactsService],
})
export class AdminPanelContactsModule {}
