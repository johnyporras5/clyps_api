import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { PanelHiddenOwner } from './entities/panel-hidden-owner.entity';
import { PanelHiddenOwnersController } from './panel-hidden-owners.controller';
import { PanelHiddenOwnersService } from './panel-hidden-owners.service';

/** "Ocultar de la lista" del panel de plataforma. No afecta al salón. */
@Module({
  imports: [TypeOrmModule.forFeature([PanelHiddenOwner, User])],
  controllers: [PanelHiddenOwnersController],
  providers: [PanelHiddenOwnersService],
})
export class AdminPanelHiddenModule {}
