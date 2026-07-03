import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('company_portfolio_pictures')
export class CompanyPortfolioPictures {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'picture', length: 145, nullable: true })
  picture: string;

  @Column({ name: 'company_id' })
  companyId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
