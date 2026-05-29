import { Company } from '../entities/company.entity';
import { User } from '../../user/entities/user.entity';

export type CompanyWithLogoUrl = Company & {
  logoUrl: string | null;
  user?: Partial<User>;
  calendarDetail?: any;
};
