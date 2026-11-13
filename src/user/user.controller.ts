import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { UserService, type PublicUser } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Lista de cuentas para el panel de plataforma (clyps-admin).
 *
 * Solo lectura y solo `padm`. Antes era un CRUD abierto sin login: cualquiera
 * listaba los hashes y con `PUT /users/:id` cambiaba la contraseña o el
 * `userType` de cualquier cuenta. Crear, editar y borrar se quitaron: nadie los
 * usaba (las cuentas nacen en `/auth/register/*`).
 *
 * `@Roles('padm')` va en CADA método a propósito: el RolesGuard lee la metadata
 * del método, no la de la clase.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles('padm')
  async findAll(): Promise<PublicUser[]> {
    return this.userService.findAll();
  }

  @Get(':id')
  @Roles('padm')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PublicUser> {
    return this.userService.findOne(id);
  }
}
