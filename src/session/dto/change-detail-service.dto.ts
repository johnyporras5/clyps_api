import { IsInt, IsOptional, IsPositive } from 'class-validator';

/**
 * Cambia el servicio de un detalle YA AGENDADO de una cita.
 * Mantiene el mismo trabajador y horario de inicio; el precio, duración,
 * reparto y totales se recalculan en el backend a partir del nuevo servicio.
 */
export class ChangeDetailServiceDto {
  // Nuevo servicio que reemplaza al actual del detalle.
  @IsInt()
  @IsPositive()
  serviceId: number;

  // Oferta opcional a aplicar al nuevo servicio (service_offer.price).
  // Si se omite, el precio es worker.cost ?? service.cost.
  @IsOptional()
  @IsInt()
  @IsPositive()
  offerId?: number;
}
