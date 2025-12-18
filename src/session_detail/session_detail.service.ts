import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionDetail } from './entities/session_detail.entity';
import { CreateSessionDetailDto } from './dto/create-session_detail.dto';
import { UpdateSessionDetailDto } from './dto/update-session_detail.dto';

@Injectable()
export class SessionDetailService {
  constructor(
    @InjectRepository(SessionDetail)
    private SessionDetailRepository: Repository<SessionDetail>,
  ) {}

  async findAll(): Promise<SessionDetail[]> {
    return await this.SessionDetailRepository.find();
  }

  async findOne(id: number): Promise<SessionDetail> {
    const SessionDetail = await this.SessionDetailRepository.findOne({ where: { id } });
    if (!SessionDetail) {
      throw new NotFoundException(`SessionDetail with id ${id} not found`);
    }
    return SessionDetail;
  }

  async create(createSessionDetailDto: CreateSessionDetailDto): Promise<SessionDetail> {
    const SessionDetail = this.SessionDetailRepository.create(createSessionDetailDto);
    return await this.SessionDetailRepository.save(SessionDetail);
  }

  async update(id: number, updateSessionDetailDto: UpdateSessionDetailDto): Promise<SessionDetail> {
    const SessionDetail = await this.SessionDetailRepository.findOne({ where: { id } });
    if (!SessionDetail) {
      throw new NotFoundException(`SessionDetail with id ${id} not found`);
    }
    
    Object.assign(SessionDetail, updateSessionDetailDto);
    return await this.SessionDetailRepository.save(SessionDetail);
  }

  async remove(id: number): Promise<void> {
    const result = await this.SessionDetailRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`SessionDetail with id ${id} not found`);
    }
  }
}
