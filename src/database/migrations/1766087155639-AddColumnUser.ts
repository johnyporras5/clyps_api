import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColumnUser1766087155639 implements MigrationInterface {
    name = 'AddColumnUser1766087155639'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` DROP FOREIGN KEY \`fk_worker_feedback_worker1\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP FOREIGN KEY \`fk_session_detail_company_worker1\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP FOREIGN KEY \`fk_session_detail_service1\``);
        await queryRunner.query(`ALTER TABLE \`session_detail\` DROP FOREIGN KEY \`fk_session_detail_session1\``);
        await queryRunner.query(`ALTER TABLE \`session\` DROP FOREIGN KEY \`fk_session_client1\``);
        await queryRunner.query(`ALTER TABLE \`service\` DROP FOREIGN KEY \`fk_service_company1\``);
        await queryRunner.query(`ALTER TABLE \`portfolio_pictures\` DROP FOREIGN KEY \`fk_portfolio_pictures_worker1\``);
        await queryRunner.query(`ALTER TABLE \`company_worker\` DROP FOREIGN KEY \`fk_company_worker_company1\``);
        await queryRunner.query(`ALTER TABLE \`company_worker\` DROP FOREIGN KEY \`fk_company_worker_worker1\``);
        await queryRunner.query(`ALTER TABLE \`company_feedback\` DROP FOREIGN KEY \`fk_company_feedback_company1\``);
        await queryRunner.query(`ALTER TABLE \`client\` DROP FOREIGN KEY \`fk_client_user\``);
        await queryRunner.query(`ALTER TABLE \`calendar\` DROP FOREIGN KEY \`fk_calendar_company_worker1\``);
        await queryRunner.query(`DROP INDEX \`fk_worker_feedback_worker1_idx\` ON \`worker_feedback\``);
        await queryRunner.query(`DROP INDEX \`fk_session_detail_company_worker1_idx\` ON \`session_detail\``);
        await queryRunner.query(`DROP INDEX \`fk_session_detail_service1_idx\` ON \`session_detail\``);
        await queryRunner.query(`DROP INDEX \`fk_session_detail_session1_idx\` ON \`session_detail\``);
        await queryRunner.query(`DROP INDEX \`fk_session_client1_idx\` ON \`session\``);
        await queryRunner.query(`DROP INDEX \`fk_service_company1_idx\` ON \`service\``);
        await queryRunner.query(`DROP INDEX \`fk_portfolio_pictures_worker1_idx\` ON \`portfolio_pictures\``);
        await queryRunner.query(`DROP INDEX \`fk_company_worker_company1_idx\` ON \`company_worker\``);
        await queryRunner.query(`DROP INDEX \`fk_company_worker_worker1_idx\` ON \`company_worker\``);
        await queryRunner.query(`DROP INDEX \`fk_company_feedback_company1_idx\` ON \`company_feedback\``);
        await queryRunner.query(`DROP INDEX \`fk_client_user_idx\` ON \`client\``);
        await queryRunner.query(`DROP INDEX \`fk_calendar_company_worker1_idx\` ON \`calendar\``);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`email_verified\` int NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`last_login\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`last_logout\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
        await queryRunner.query(`ALTER TABLE \`user\` ADD \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`updated_at\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`created_at\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`last_logout\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`last_login\``);
        await queryRunner.query(`ALTER TABLE \`user\` DROP COLUMN \`email_verified\``);
        await queryRunner.query(`CREATE INDEX \`fk_calendar_company_worker1_idx\` ON \`calendar\` (\`company_worker_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_client_user_idx\` ON \`client\` (\`user_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_company_feedback_company1_idx\` ON \`company_feedback\` (\`company_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_company_worker_worker1_idx\` ON \`company_worker\` (\`worker_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_company_worker_company1_idx\` ON \`company_worker\` (\`company_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_portfolio_pictures_worker1_idx\` ON \`portfolio_pictures\` (\`worker_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_service_company1_idx\` ON \`service\` (\`company_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_session_client1_idx\` ON \`session\` (\`client_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_session_detail_session1_idx\` ON \`session_detail\` (\`session_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_session_detail_service1_idx\` ON \`session_detail\` (\`service_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_session_detail_company_worker1_idx\` ON \`session_detail\` (\`company_worker_id\`)`);
        await queryRunner.query(`CREATE INDEX \`fk_worker_feedback_worker1_idx\` ON \`worker_feedback\` (\`worker_id\`)`);
        await queryRunner.query(`ALTER TABLE \`calendar\` ADD CONSTRAINT \`fk_calendar_company_worker1\` FOREIGN KEY (\`company_worker_id\`) REFERENCES \`company_worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`client\` ADD CONSTRAINT \`fk_client_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_feedback\` ADD CONSTRAINT \`fk_company_feedback_company1\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_worker\` ADD CONSTRAINT \`fk_company_worker_worker1\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`company_worker\` ADD CONSTRAINT \`fk_company_worker_company1\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`portfolio_pictures\` ADD CONSTRAINT \`fk_portfolio_pictures_worker1\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`service\` ADD CONSTRAINT \`fk_service_company1\` FOREIGN KEY (\`company_id\`) REFERENCES \`company\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`session\` ADD CONSTRAINT \`fk_session_client1\` FOREIGN KEY (\`client_id\`) REFERENCES \`client\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD CONSTRAINT \`fk_session_detail_session1\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD CONSTRAINT \`fk_session_detail_service1\` FOREIGN KEY (\`service_id\`) REFERENCES \`service\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`session_detail\` ADD CONSTRAINT \`fk_session_detail_company_worker1\` FOREIGN KEY (\`company_worker_id\`) REFERENCES \`company_worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`worker_feedback\` ADD CONSTRAINT \`fk_worker_feedback_worker1\` FOREIGN KEY (\`worker_id\`) REFERENCES \`worker\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
