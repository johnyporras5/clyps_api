import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserVerificationCodes } from './entities/user-verification-codes.entity';
import { CreateUserVerificationCodesDto } from './dto/create-user_verification_codes.dto';
import { UpdateUserVerificationCodesDto } from './dto/update-user_verification_codes.dto';

@Injectable()
export class UserVerificationCodesService {
  constructor(
    @InjectRepository(UserVerificationCodes)
    private UserVerificationCodesRepository: Repository<UserVerificationCodes>,
  ) {}

  async findAll(): Promise<UserVerificationCodes[]> {
    return await this.UserVerificationCodesRepository.find();
  }

  async findOne(id: number): Promise<UserVerificationCodes> {
    const UserVerificationCodes = await this.UserVerificationCodesRepository.findOne({ where: { id } });
    if (!UserVerificationCodes) {
      throw new NotFoundException(`UserVerificationCodes with id ${id} not found`);
    }
    return UserVerificationCodes;
  }

  async create(createUserVerificationCodesDto: CreateUserVerificationCodesDto): Promise<UserVerificationCodes> {
    const UserVerificationCodes = this.UserVerificationCodesRepository.create(createUserVerificationCodesDto);
    return await this.UserVerificationCodesRepository.save(UserVerificationCodes);
  }

  async update(id: number, updateUserVerificationCodesDto: UpdateUserVerificationCodesDto): Promise<UserVerificationCodes> {
    const UserVerificationCodes = await this.UserVerificationCodesRepository.findOne({ where: { id } });
    if (!UserVerificationCodes) {
      throw new NotFoundException(`UserVerificationCodes with id ${id} not found`);
    }
    
    Object.assign(UserVerificationCodes, updateUserVerificationCodesDto);
    return await this.UserVerificationCodesRepository.save(UserVerificationCodes);
  }

  async remove(id: number): Promise<void> {
    const result = await this.UserVerificationCodesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`UserVerificationCodes with id ${id} not found`);
    }
  }
}
