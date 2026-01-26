import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Client } from './entities/client.entity';
import { User } from '../user/entities/user.entity';
import { Company } from '../company/entities/company.entity';
import { PaginationDto } from '../common/dto/pagination.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { FileUploadService } from '../common/services/file_upload.service';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);

  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    private fileUploadService: FileUploadService,
  ) {}

  /**
   * Endpoint para listar clientes para un administrador
   * @param adminId ID del usuario administrador autenticado
   * @param options Opciones de paginación
   * @returns Lista paginada de clientes
   * 
   * Lógica de visibilidad:
   * - Cliente PÚBLICO (isPublic = 1): Visible para CUALQUIER admin logueado
   * - Cliente PRIVADO (isPublic = 0): Solo visible para admins cuyas compañías están en el array companies del cliente
   */
  async findAllByAdminCompanies(
    adminId: number,
    options: PaginationDto
  ): Promise<PaginationResult<any>> {
    this.logger.log(`=== SERVICE: LISTANDO CLIENTES PARA ADMIN ID: ${adminId} ===`);

    await this.validateUserExists(adminId);

    // 1. Obtener las compañías del admin (si las tiene)
    const adminCompanies = await this.companyRepository.find({
      where: { userId: adminId }
    });

    const adminCompanyIds = adminCompanies.map(company => company.id);
    this.logger.log(`[DEBUG] IDs de compañías del admin ${adminId}: ${adminCompanyIds}`);

    // 2. Construir query con la nueva lógica
    const queryBuilder = this.clientRepository.createQueryBuilder('client')
      .leftJoinAndSelect('client.user', 'user')
      .where('client.isActive = :isActive', { isActive: 1 });

    // 3. Aplicar condiciones según la visibilidad del cliente
    if (adminCompanyIds.length === 0) {
      // Admin SIN compañías: Solo puede ver clientes PÚBLICOS
      queryBuilder.andWhere('client.isPublic = :isPublic', { isPublic: 1 });
    } else {
      // Admin CON compañías: Puede ver:
      // a) TODOS los clientes públicos (sin importar compañías)
      // b) Clientes privados que compartan compañías con el admin
      queryBuilder.andWhere(new Brackets(qb => {
        // Condición para clientes PÚBLICOS (visible para todos)
        qb.where('client.isPublic = :isPublic', { isPublic: 1 })
          
          // O condición para clientes PRIVADOS que compartan compañías
          .orWhere(new Brackets(privateQb => {
            privateQb.where('client.isPublic = :isPrivate', { isPrivate: 0 });
            
            // Solo si hay intersección entre compañías del cliente y del admin
            const companyConditions = adminCompanyIds.map((companyId, index) => 
              `JSON_CONTAINS(client.companies, :companyId${index})`
            ).join(' OR ');
            
            if (companyConditions) {
              privateQb.andWhere(`(${companyConditions})`);
            }
          }));
      }));

      // Asignar parámetros para cada compañía (solo para la parte privada)
      adminCompanyIds.forEach((companyId, index) => {
        queryBuilder.setParameter(`companyId${index}`, JSON.stringify(companyId));
      });
    }

    // 4. Aplicar paginación
    const result = await paginate(
      queryBuilder,
      { page: options.page, limit: options.limit }
    );

    this.logger.log(`[DEBUG] Total de clientes encontrados: ${result.meta.total}`);

    // 5. Enriquecer datos de respuesta
    return {
      data: this.enrichClientData(result.data, adminCompanies, adminCompanyIds, adminId),
      meta: result.meta
    };
  }

  /**
   * Enriquecer datos del cliente para la respuesta
   */
  private enrichClientData(
    clients: Client[], 
    adminCompanies: Company[], 
    adminCompanyIds: number[], 
    adminId: number
  ): any[] {
    return clients.map(client => {
      let sharedCompanies: Company[] = [];
      let visibilityReason = '';

      if (client.isPublic === 1) {
        // Cliente PÚBLICO: visible para todos
        visibilityReason = 'Cliente público (visible para todos los administradores)';
        
        // Si el cliente tiene compañías, mostrar cuáles son
        if (client.companies && client.companies.length > 0) {
          sharedCompanies = adminCompanies.filter(company => 
            client.companies.includes(company.id)
          );
        }
      } else {
        // Cliente PRIVADO: solo visible si comparte compañías
        visibilityReason = 'Cliente privado';
        
        if (client.companies && client.companies.length > 0) {
          sharedCompanies = adminCompanies.filter(company => 
            client.companies.includes(company.id)
          );
          
          if (sharedCompanies.length > 0) {
            visibilityReason = `Cliente privado afiliado a ${sharedCompanies.length} de tus compañías`;
          }
        }
      }

      return {
        ...client,
        pictureUrl: client.picture ? this.fileUploadService.getFileUrl('client_photo', client.picture) : null,
        sharedCompanies,
        isOwner: client.userId === adminId,
        visibility: client.isPublic === 1 ? 'publico' : 'privado',
        visibilityReason,
        sharedCompaniesCount: sharedCompanies.length,
        // Información adicional útil
        hasAccess: client.isPublic === 1 || sharedCompanies.length > 0,
        accessibleToAdmin: adminCompanyIds.length > 0 || client.isPublic === 1
      };
    });
  }

  /**
   * Validar que el usuario exista
   */
  private async validateUserExists(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException(`Error: Usuario con ID ${userId} no encontrado`);
    }
  }
}