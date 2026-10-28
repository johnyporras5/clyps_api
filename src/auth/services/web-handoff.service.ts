import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LessThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { User } from '../../user/entities/user.entity';
import { WebHandoffTicket } from '../entities/web_handoff_ticket.entity';
import { AuthService } from '../auth.service';

const DEFAULT_TICKET_TTL_SECONDS = 60;

@Injectable()
export class WebHandoffService {
  constructor(
    @InjectRepository(WebHandoffTicket)
    private readonly tickets: Repository<WebHandoffTicket>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private ticketTtlSeconds(): number {
    const raw = Number(this.config.get('WEB_HANDOFF_TICKET_TTL_SECONDS'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TICKET_TTL_SECONDS;
  }

  private hashTicket(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }

  async create(userId: number): Promise<{ ticket: string; expiresAt: string }> {
    await this.tickets.delete({ expiresAt: LessThan(new Date()) });

    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ticketTtlSeconds() * 1000);
    await this.tickets.save(
      this.tickets.create({
        userId,
        ticketHash: this.hashTicket(ticket),
        expiresAt,
        usedAt: null,
      }),
    );
    return { ticket, expiresAt: expiresAt.toISOString() };
  }

  async exchange(ticket: string) {
    const invalid = () =>
      new UnauthorizedException(
        'El enlace de acceso no es válido, ya se usó o ha caducado.',
      );

    const row = await this.tickets.findOne({
      where: { ticketHash: this.hashTicket(ticket) },
    });
    if (!row) throw invalid();

    const consumed = await this.tickets
      .createQueryBuilder()
      .update(WebHandoffTicket)
      .set({ usedAt: new Date() })
      .where('id = :id AND used_at IS NULL', { id: row.id })
      .execute();
    if (!consumed.affected) throw invalid();
    if (row.expiresAt.getTime() < Date.now()) throw invalid();

    const user = await this.users.findOne({ where: { id: row.userId } });
    if (!user) throw invalid();
    if (user.userType !== 'adm') {
      throw new ForbiddenException(
        'Solo el administrador del salón puede abrir su cuenta en la web.',
      );
    }

    const companyClaims = await this.authService.buildCompanyClaims(user);
    const access_token = this.jwtService.sign({
      email: user.email,
      sub: user.id,
      userType: user.userType,
      companyId: companyClaims.companyId,
      companyWorkerId: companyClaims.companyWorkerId,
    });
    const { password: _password, ...userWithoutPassword } = user;

    return { access_token, user: userWithoutPassword };
  }
}
