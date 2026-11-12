import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

/** La cuenta sin el hash de la contraseña: lo único que sale por la API. */
export type PublicUser = Omit<User, 'password'>;

/**
 * Columnas que se leen. `password` NO está: el hash nunca debe salir en una
 * respuesta, ni siquiera a un `padm` (un hash filtrado se puede atacar offline).
 */
const PUBLIC_COLUMNS: (keyof User)[] = [
  'id',
  'username',
  'email',
  'userType',
  'lastLogin',
  'lastLogout',
  'createdAt',
  'updatedAt',
  'emailVerified',
];

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<PublicUser[]> {
    return this.userRepository.find({ select: PUBLIC_COLUMNS });
  }

  async findOne(id: number): Promise<PublicUser> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: PUBLIC_COLUMNS,
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }
}
