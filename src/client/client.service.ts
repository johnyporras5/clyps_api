import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(Client)
    private ClientRepository: Repository<Client>,
  ) {}

  async findAll(): Promise<Client[]> {
    return await this.ClientRepository.find();
  }

  async findOne(id: number): Promise<Client> {
    const Client = await this.ClientRepository.findOne({ where: { id } });
    if (!Client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
    return Client;
  }

  async create(createClientDto: CreateClientDto): Promise<Client> {
    const Client = this.ClientRepository.create(createClientDto);
    return await this.ClientRepository.save(Client);
  }

  async update(id: number, updateClientDto: UpdateClientDto): Promise<Client> {
    const Client = await this.ClientRepository.findOne({ where: { id } });
    if (!Client) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
    
    Object.assign(Client, updateClientDto);
    return await this.ClientRepository.save(Client);
  }

  async remove(id: number): Promise<void> {
    const result = await this.ClientRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Client with id ${id} not found`);
    }
  }
}
