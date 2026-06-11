import { IsIn, IsNotEmpty } from 'class-validator';

/** Query del listado de clientes por categoría (para el modal de cada tarjeta). */
export class ClientsListQueryDto {
  @IsNotEmpty()
  @IsIn(['active', 'new', 'churned'], {
    message: 'category debe ser: active, new o churned',
  })
  category: 'active' | 'new' | 'churned';
}
