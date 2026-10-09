import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { AuthenticatedUser } from '../../auth/types/authenticated-request';
import { isLegacyIdentityCompany } from '../utils/legacy-identity.util';
import { stripIdentification } from '../utils/strip-identification.util';

/**
 * Los salones excluidos del cambio de identidad (legacy-identity.util.ts) no
 * ven la cédula/RIF de nadie: ni de sus trabajadores, ni de sus clientes —que
 * pueden tenerla cargada por otro salón al que también van—, ni la suya.
 *
 * Se resuelve aquí, una vez, en vez de en cada endpoint: clientes y
 * trabajadores salen anidados en citas, reportes y listas, y un endpoint
 * olvidado la filtraría. Mira el salón del token (`companyId`), que traen el
 * dueño y el trabajador; el cliente no lo trae y sigue viendo la suya.
 *
 * Los eventos de WebSockets no pasan por aquí: los cubre RealtimeService.
 */
@Injectable()
export class HideIdentificationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    return next
      .handle()
      .pipe(
        map((body: unknown) =>
          isLegacyIdentityCompany(request.user?.companyId)
            ? stripIdentification(body)
            : body,
        ),
      );
  }
}
