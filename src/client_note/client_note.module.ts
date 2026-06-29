import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientNoteService } from './client_note.service';
import { ClientNoteController } from './client_note.controller';
import { ClientNote } from './entities/client_note.entity';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ClientNote, Client, Company])],
  providers: [ClientNoteService],
  controllers: [ClientNoteController],
  exports: [ClientNoteService],
})
export class ClientNoteModule {}
