import { Module } from '@nestjs/common';
import { FileUploadService } from './services/file_upload.service';

@Module({
  providers: [FileUploadService],
  exports: [FileUploadService],
})
export class CommonModule {}