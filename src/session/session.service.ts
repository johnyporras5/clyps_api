import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private SessionRepository: Repository<Session>,
  ) {}

  async findAll(): Promise<Session[]> {
    return await this.SessionRepository.find();
  }

  async findOne(id: number): Promise<Session> {
    const Session = await this.SessionRepository.findOne({ where: { id } });
    if (!Session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
    return Session;
  }

  async create(createSessionDto: CreateSessionDto): Promise<Session> {
    const Session = this.SessionRepository.create(createSessionDto);
    return await this.SessionRepository.save(Session);
  }

  async update(id: number, updateSessionDto: UpdateSessionDto): Promise<Session> {
    const Session = await this.SessionRepository.findOne({ where: { id } });
    if (!Session) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
    
    Object.assign(Session, updateSessionDto);
    return await this.SessionRepository.save(Session);
  }

  async remove(id: number): Promise<void> {
    const result = await this.SessionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Session with id ${id} not found`);
    }
  }
}
