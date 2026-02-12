import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ia_prompts')
export class IAPrompts {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        name: 'text',
        type: 'text',
        nullable: false,
    })
    text: string;

    @Column({
        name: 'tipo',
        type: 'varchar',
        length: 1,
        nullable: false,
    })
    type: string; // Valores esperados: 'p' o 'c'
}