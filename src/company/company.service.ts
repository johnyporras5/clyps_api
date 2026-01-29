import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { User } from '../user/entities/user.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { FileUploadService } from '../common/services/file_upload.service';
import { CompanyWithLogoUrl } from './types/company-with-logo-url.type';
import { 
  paginate, 
  PaginationOptions, 
  PaginationResult 
} from '../common/utils/pagination.util';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(FileUploadService)
    private fileUploadService: FileUploadService,
  ) { }

  async findAll(
    options: PaginationOptions
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    const paginationResult = await paginate(
      this.companyRepository,
      options
    );

    // Transformar los datos para incluir logoUrl
    const dataWithLogoUrl = paginationResult.data.map(company => {
      const companyWithLogo: CompanyWithLogoUrl = {
        ...company,
        logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null
      };
      return companyWithLogo;
    });

    return {
      ...paginationResult,
      data: dataWithLogoUrl
    };
  }

  async findOne(id: number): Promise<CompanyWithLogoUrl> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    
    const companyWithLogo: CompanyWithLogoUrl = {
      ...company,
      logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null
    };
    
    return companyWithLogo;
  }

  async findByUserId(userId: number): Promise<CompanyWithLogoUrl> {
    const company = await this.companyRepository.findOne({
      where: { userId }
    });

    if (!company) {
      throw new NotFoundException(`Company for user with id ${userId} not found`);
    }

    // Obtener los datos del usuario
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Excluir el password del usuario por seguridad
    const { password, ...userWithoutPassword } = user;

    const companyWithLogo: CompanyWithLogoUrl = {
      ...company,
      logoUrl: company.logo ? this.fileUploadService.getFileUrl('company_logo', company.logo) : null,
      user: userWithoutPassword
    };

    return companyWithLogo;
  }

  async create(createCompanyDto: CreateCompanyDto): Promise<Company> {
    const company = this.companyRepository.create(createCompanyDto);
    return await this.companyRepository.save(company);
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<CompanyWithLogoUrl> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    Object.assign(company, updateCompanyDto);
    const updatedCompany = await this.companyRepository.save(company);

    const companyWithLogo: CompanyWithLogoUrl = {
      ...updatedCompany,
      logoUrl: updatedCompany.logo ? this.fileUploadService.getFileUrl('company_logo', updatedCompany.logo) : null
    };

    return companyWithLogo;
  }

  async remove(id: number): Promise<void> {
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    
    // Eliminar el archivo del logo si existe
    if (company.logo) {
      this.fileUploadService.deleteFile('company_logo', company.logo);
    }
    
    const result = await this.companyRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
  }
}