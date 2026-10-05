import { Company } from '../entities/company.entity';
import { User } from '../../user/entities/user.entity';

// `identification` es opcional porque las respuestas que ve cualquiera (el
// directorio, el perfil del salón) no la llevan: puede ser la cédula del
// dueño. Solo sale en las del propio dueño.
export type CompanyWithLogoUrl = Omit<Company, 'identification'> & {
  identification?: string | null;
  /** Solo en el perfil del dueño: si su salón pide y muestra la cédula/RIF. */
  identificationEnabled?: boolean;
  logoUrl: string | null;
  user?: Partial<User>;
  calendarDetail?: any;
};
