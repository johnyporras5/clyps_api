import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { Client } from './entities/client.entity';
import { Company } from 'src/company/entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { FileUploadService } from 'src/common/services/file_upload.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, User, Company])],
  providers: [ClientService, FileUploadService],
  controllers: [ClientController],
  exports: [ClientService],
})
export class ClientModule { }
