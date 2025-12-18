import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';
import { CreatePortfolioPicturesDto } from './dto/create-portfolio_pictures.dto';
import { UpdatePortfolioPicturesDto } from './dto/update-portfolio_pictures.dto';

@Injectable()
export class PortfolioPicturesService {
  constructor(
    @InjectRepository(PortfolioPictures)
    private PortfolioPicturesRepository: Repository<PortfolioPictures>,
  ) {}

  async findAll(): Promise<PortfolioPictures[]> {
    return await this.PortfolioPicturesRepository.find();
  }

  async findOne(id: number): Promise<PortfolioPictures> {
    const PortfolioPictures = await this.PortfolioPicturesRepository.findOne({ where: { id } });
    if (!PortfolioPictures) {
      throw new NotFoundException(`PortfolioPictures with id ${id} not found`);
    }
    return PortfolioPictures;
  }

  async create(createPortfolioPicturesDto: CreatePortfolioPicturesDto): Promise<PortfolioPictures> {
    const PortfolioPictures = this.PortfolioPicturesRepository.create(createPortfolioPicturesDto);
    return await this.PortfolioPicturesRepository.save(PortfolioPictures);
  }

  async update(id: number, updatePortfolioPicturesDto: UpdatePortfolioPicturesDto): Promise<PortfolioPictures> {
    const PortfolioPictures = await this.PortfolioPicturesRepository.findOne({ where: { id } });
    if (!PortfolioPictures) {
      throw new NotFoundException(`PortfolioPictures with id ${id} not found`);
    }
    
    Object.assign(PortfolioPictures, updatePortfolioPicturesDto);
    return await this.PortfolioPicturesRepository.save(PortfolioPictures);
  }

  async remove(id: number): Promise<void> {
    const result = await this.PortfolioPicturesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`PortfolioPictures with id ${id} not found`);
    }
  }
}
