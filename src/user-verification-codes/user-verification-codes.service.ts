import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserVerificationCodes } from './entities/user-verification-codes.entity';

@Injectable()
export class UserVerificationCodesService {
  constructor(
    @InjectRepository(UserVerificationCodes)
    private verificationCodesRepository: Repository<UserVerificationCodes>,
  ) {}

  async create(userId: number, code: string, expiresAt: Date, codeType: string = 'email_verification'): Promise<UserVerificationCodes> {
    const verificationCode = this.verificationCodesRepository.create({
      userId,
      code,
      expiresAt,
      codeType,
      used: 0,
    });
    return await this.verificationCodesRepository.save(verificationCode);
  }

  async findActiveCode(userId: number, codeType: string = 'email_verification'): Promise<UserVerificationCodes | null> {
    const now = new Date();
    return await this.verificationCodesRepository.findOne({
      where: {
        userId,
        codeType,
        used: 0,
        expiresAt: MoreThan(now),
      },
      order: { id: 'DESC' },
    });
  }

  async findCodeByUserIdAndCode(userId: number, code: string, codeType?: string): Promise<UserVerificationCodes | null> {
    const where: any = {
      userId,
      code,
      used: 0,
    };
    
    if (codeType) {
      where.codeType = codeType;
    }
    
    return await this.verificationCodesRepository.findOne({
      where,
      order: { id: 'DESC' },
    });
  }

  async markAsUsed(id: number): Promise<void> {
    await this.verificationCodesRepository.update(id, { used: 1 });
  }

  async delete(id: number): Promise<void> {
    await this.verificationCodesRepository.delete(id);
  }

  async deleteExpiredCodes(): Promise<number> {
    const now = new Date();
    const result = await this.verificationCodesRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now })
      .execute();
    
    return result.affected || 0;
  }

  async deleteExpiredCodesByUser(userId: number, codeType?: string): Promise<number> {
    const now = new Date();
    let query = this.verificationCodesRepository
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId AND expires_at < :now', {
        userId,
        now
      });
    
    if (codeType) {
      query = query.andWhere('code_type = :codeType', { codeType });
    }
    
    const result = await query.execute();
    return result.affected || 0;
  }

  async getVerificationCodeStatus(userId: number): Promise<{ 
    hasActiveCode: boolean; 
    expiresAt?: Date; 
    secondsRemaining?: number;
  }> {
    const now = new Date();
    const activeCode = await this.findActiveCode(userId);
    
    if (!activeCode) {
      return { hasActiveCode: false };
    }
    
    const secondsRemaining = Math.floor((activeCode.expiresAt.getTime() - now.getTime()) / 1000);
    
    return {
      hasActiveCode: true,
      expiresAt: activeCode.expiresAt,
      secondsRemaining
    };
  }
}