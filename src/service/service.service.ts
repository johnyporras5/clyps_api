import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServiceService {
  constructor(
    @InjectRepository(Service)
    private ServiceRepository: Repository<Service>,
  ) {}

  async findAll(): Promise<Service[]> {
    return await this.ServiceRepository.find();
  }

  async findOne(id: number): Promise<Service> {
    const Service = await this.ServiceRepository.findOne({ where: { id } });
    if (!Service) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
    return Service;
  }

  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    const Service = this.ServiceRepository.create(createServiceDto);
    return await this.ServiceRepository.save(Service);
  }

  async update(id: number, updateServiceDto: UpdateServiceDto): Promise<Service> {
    const Service = await this.ServiceRepository.findOne({ where: { id } });
    if (!Service) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
    
    Object.assign(Service, updateServiceDto);
    return await this.ServiceRepository.save(Service);
  }

  async remove(id: number): Promise<void> {
    const result = await this.ServiceRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Service with id ${id} not found`);
    }
  }
}
