import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientNote } from './entities/client_note.entity';
import { Client } from '../client/entities/client.entity';
import { Company } from '../company/entities/company.entity';
import { CreateClientNoteDto } from './dto/create-client_note.dto';
import { UpdateClientNoteDto } from './dto/update-client_note.dto';

@Injectable()
export class ClientNoteService {
  constructor(
    @InjectRepository(ClientNote)
    private readonly clientNoteRepository: Repository<ClientNote>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  /**
   * Crea la nota del admin autenticado sobre un cliente. Cada admin tiene como
   * máximo una nota por cliente: si ya existe, devuelve 409 (debe actualizarla).
   */
  async create(
    adminUserId: number,
    companyId: number | null,
    dto: CreateClientNoteDto,
  ): Promise<ClientNote> {
    await this.assertClientExists(dto.clientId);

    const existing = await this.clientNoteRepository.findOne({
      where: { clientId: dto.clientId, createdByUserId: adminUserId },
    });
    if (existing) {
      throw new ConflictException(
        'Ya tienes una nota para este cliente; actualízala en lugar de crear otra',
      );
    }

    const note = this.clientNoteRepository.create({
      clientId: dto.clientId,
      createdByUserId: adminUserId,
      companyId: companyId ?? null,
      note: dto.note.trim(),
    });
    const saved = await this.clientNoteRepository.save(note);
    await this.hydrate([saved], adminUserId);
    return saved;
  }

  /**
   * Lista todas las notas de un cliente (de cualquier compañía). Cada nota se
   * marca con `mine` para el admin que consulta.
   */
  async findByClient(
    clientId: number,
    adminUserId: number,
  ): Promise<ClientNote[]> {
    await this.assertClientExists(clientId);
    const notes = await this.clientNoteRepository.find({
      where: { clientId },
      order: { updatedAt: 'DESC' },
    });
    await this.hydrate(notes, adminUserId);
    return notes;
  }

  /** Actualiza una nota. Sólo el autor puede hacerlo. */
  async update(
    id: number,
    adminUserId: number,
    dto: UpdateClientNoteDto,
  ): Promise<ClientNote> {
    const note = await this.getOwnedNote(id, adminUserId);
    note.note = dto.note.trim();
    const saved = await this.clientNoteRepository.save(note);
    await this.hydrate([saved], adminUserId);
    return saved;
  }

  /** Elimina una nota. Sólo el autor puede hacerlo. */
  async remove(id: number, adminUserId: number): Promise<void> {
    const note = await this.getOwnedNote(id, adminUserId);
    await this.clientNoteRepository.delete(note.id);
  }

  // ---------------------------------------------------------------------------

  private async assertClientExists(clientId: number): Promise<void> {
    const exists = await this.clientRepository.exists({
      where: { id: clientId },
    });
    if (!exists) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }
  }

  /** Devuelve la nota sólo si existe y pertenece al admin; si no, lanza error. */
  private async getOwnedNote(
    id: number,
    adminUserId: number,
  ): Promise<ClientNote> {
    const note = await this.clientNoteRepository.findOne({ where: { id } });
    if (!note) {
      throw new NotFoundException(`Nota con ID ${id} no encontrada`);
    }
    if (note.createdByUserId !== adminUserId) {
      throw new ForbiddenException('Sólo puedes modificar tus propias notas');
    }
    return note;
  }

  /** Adjunta companyName y la marca `mine` a cada nota. */
  private async hydrate(
    notes: ClientNote[],
    adminUserId: number,
  ): Promise<void> {
    if (notes.length === 0) return;

    const companyIds = [
      ...new Set(
        notes
          .map((n) => n.companyId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    ];
    const companyNameById = new Map<number, string | null>();
    if (companyIds.length > 0) {
      const companies = await this.companyRepository.find({
        where: { id: In(companyIds) },
        select: ['id', 'name'],
      });
      for (const c of companies) companyNameById.set(c.id, c.name ?? null);
    }

    for (const n of notes) {
      n.companyName =
        n.companyId != null ? (companyNameById.get(n.companyId) ?? null) : null;
      n.mine = n.createdByUserId === adminUserId;
    }
  }
}
