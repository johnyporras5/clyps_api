import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private UserRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return await this.UserRepository.find();
  }

  async findOne(id: number): Promise<User> {
    const User = await this.UserRepository.findOne({ where: { id } });
    if (!User) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return User;
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const User = this.UserRepository.create(createUserDto);
    return await this.UserRepository.save(User);
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const User = await this.UserRepository.findOne({ where: { id } });
    if (!User) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    
    Object.assign(User, updateUserDto);
    return await this.UserRepository.save(User);
  }

  async remove(id: number): Promise<void> {
    const result = await this.UserRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }
}
