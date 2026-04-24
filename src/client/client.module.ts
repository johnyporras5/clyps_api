import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { Client } from './entities/client.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { Session } from 'src/session/entities/session.entity';
import { FileUploadService } from '../common/services/file_upload.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, User, Company, Session])],
  providers: [ClientService, FileUploadService],
  controllers: [ClientController],
  exports: [ClientService],
})
export class ClientModule { }
