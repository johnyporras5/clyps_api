-- Estructura generada por test/integration/schema/refresh-schema.js.
-- NO editar a mano. Sin datos: solo tablas y el historial de migraciones.
-- Generada: 2026-11-20T16:57:52.070Z
-- sql_mode: REAL_AS_FLOAT,PIPES_AS_CONCAT,ANSI_QUOTES,IGNORE_SPACE,ONLY_FULL_GROUP_BY,ANSI,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
SET SESSION sql_mode = 'REAL_AS_FLOAT,PIPES_AS_CONCAT,ANSI_QUOTES,IGNORE_SPACE,ONLY_FULL_GROUP_BY,ANSI,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE "appointment_before_after" (
  "id" int NOT NULL AUTO_INCREMENT,
  "session_id" int NOT NULL,
  "before_picture" varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "before_uploaded_at" datetime DEFAULT NULL,
  "before_uploaded_by_id" int DEFAULT NULL,
  "before_uploaded_by_name" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "after_picture" varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "after_uploaded_at" datetime DEFAULT NULL,
  "after_uploaded_by_id" int DEFAULT NULL,
  "after_uploaded_by_name" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_appointment_before_after_session" ("session_id")
);

CREATE TABLE "blacklisted_tokens" (
  "id" int NOT NULL AUTO_INCREMENT,
  "token" text NOT NULL,
  "expiresAt" bigint NOT NULL,
  "userId" int DEFAULT NULL,
  "reason" varchar(255) DEFAULT NULL,
  "createdAt" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "clearedAt" datetime DEFAULT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_7e6c16a1c0e40ea23436409d07" ("clearedAt")
);

CREATE TABLE "calendar" (
  "id" int NOT NULL AUTO_INCREMENT,
  "calendar_detail" json DEFAULT NULL,
  "status" varchar(45) DEFAULT NULL,
  "company_worker_id" int NOT NULL,
  PRIMARY KEY ("id","company_worker_id")
);

CREATE TABLE "calendar_company" (
  "id" int NOT NULL AUTO_INCREMENT,
  "calendar_detail" json DEFAULT NULL,
  "status" varchar(45) DEFAULT NULL,
  "company_id" int NOT NULL,
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "FK_bd2cc6847ea8f585bf4f76dec3a" ("company_id"),
  CONSTRAINT "FK_bd2cc6847ea8f585bf4f76dec3a" FOREIGN KEY ("company_id") REFERENCES "company" ("id")
);

CREATE TABLE "campaign_email_log" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "campaign" varchar(40) NOT NULL,
  "email" varchar(245) NOT NULL,
  "status" varchar(12) NOT NULL DEFAULT 'sending',
  "error" varchar(255) DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" datetime DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_campaign_email_log_company_campaign" ("company_id","campaign"),
  KEY "IDX_campaign_email_log_campaign_status" ("campaign","status")
);

CREATE TABLE "cash_category" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "name" varchar(145) COLLATE utf8mb4_unicode_ci NOT NULL,
  "kind" varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_cash_category_company_name" ("company_id","name"),
  CONSTRAINT "FK_cash_category_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE,
  CONSTRAINT "CHK_cash_category_kind" CHECK ((`kind` in (_utf8mb4'income',_utf8mb4'expense',_utf8mb4'both')))
);

CREATE TABLE "cash_closing" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "date" date NOT NULL,
  "version" int NOT NULL,
  "status" varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  "opening_cash" json NOT NULL,
  "closing_lines" json NOT NULL,
  "retained_cash" json NOT NULL,
  "has_difference" tinyint NOT NULL DEFAULT '0',
  "notes" varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "closed_by_user_id" int NOT NULL,
  "closed_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reverted_by_user_id" int DEFAULT NULL,
  "reverted_at" datetime DEFAULT NULL,
  "revert_reason" varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "active_date" date GENERATED ALWAYS AS (if((`status` = _utf8mb4'closed'),`date`,NULL)) STORED,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_cash_closing_company_version" ("company_id","date","version"),
  UNIQUE KEY "UQ_cash_closing_company_active" ("company_id","active_date"),
  KEY "IDX_cash_closing_company_date" ("company_id","date"),
  CONSTRAINT "CHK_cash_closing_status" CHECK ((`status` in (_utf8mb4'closed',_utf8mb4'reverted')))
);

CREATE TABLE "cash_transaction" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "kind" varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  "concept" varchar(145) COLLATE utf8mb4_unicode_ci NOT NULL,
  "category_id" int NOT NULL,
  "amount_minor" bigint NOT NULL,
  "date" date NOT NULL,
  "payment_method" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  "payment_reference" varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "supplier_name" varchar(145) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "is_recurring" tinyint(1) NOT NULL DEFAULT '0',
  "created_by_user_id" int NOT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supplier_key" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  "currency" varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VES',
  "exchange_rate" decimal(18,4) DEFAULT NULL,
  "amount_bs_minor" bigint NOT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_cash_transaction_company_date" ("company_id","date"),
  KEY "FK_cash_transaction_category" ("category_id"),
  KEY "IDX_cash_transaction_company_supplier" ("company_id","supplier_key"),
  CONSTRAINT "FK_cash_transaction_category" FOREIGN KEY ("category_id") REFERENCES "cash_category" ("id") ON DELETE RESTRICT,
  CONSTRAINT "CHK_cash_transaction_amount_bs_positive" CHECK ((`amount_bs_minor` > 0)),
  CONSTRAINT "CHK_cash_transaction_amount_positive" CHECK ((`amount_minor` > 0)),
  CONSTRAINT "CHK_cash_transaction_kind" CHECK ((`kind` in (_utf8mb4'income',_utf8mb4'expense')))
);

CREATE TABLE "catalog_deletion" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "entity" varchar(30) NOT NULL,
  "entity_id" int NOT NULL,
  "deleted_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "IDX_catalog_deletion_lookup" ("company_id","entity","deleted_at"),
  KEY "IDX_catalog_deletion_deleted_at" ("deleted_at")
);

CREATE TABLE "client" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) DEFAULT NULL,
  "last_name" varchar(145) DEFAULT NULL,
  "email" varchar(145) DEFAULT NULL,
  "location" varchar(245) DEFAULT NULL,
  "user_id" int DEFAULT NULL,
  "phone" varchar(20) DEFAULT NULL,
  "birth_date" date DEFAULT NULL,
  "picture" varchar(500) DEFAULT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  "companies" json DEFAULT NULL,
  "temporarily_deleted" tinyint NOT NULL DEFAULT '0',
  "permanently_deleted" tinyint NOT NULL DEFAULT '0',
  "company_aliases" json DEFAULT NULL,
  "company_first_appointments" json DEFAULT NULL,
  "preferences" json DEFAULT NULL,
  "created_by_company_worker_id" int DEFAULT NULL,
  "inactive_companies" json DEFAULT NULL,
  "identification" varchar(20) DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "company_visit_frequencies" json DEFAULT NULL,
  "created_offline_at" datetime DEFAULT NULL,
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "REL_f18a6fabea7b2a90ab6bf10a65" ("user_id"),
  KEY "IDX_client_identification" ("identification"),
  KEY "IDX_client_updated" ("updated_at"),
  CONSTRAINT "FK_f18a6fabea7b2a90ab6bf10a650" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "client_favorite_company" (
  "id" int NOT NULL AUTO_INCREMENT,
  "client_id" int NOT NULL,
  "company_id" int NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_client_favorite_company_client_company" ("client_id","company_id"),
  KEY "IDX_client_favorite_company_client" ("client_id"),
  KEY "IDX_client_favorite_company_company" ("company_id"),
  CONSTRAINT "FK_client_favorite_company_client" FOREIGN KEY ("client_id") REFERENCES "client" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_client_favorite_company_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "client_note" (
  "id" int NOT NULL AUTO_INCREMENT,
  "client_id" int NOT NULL,
  "created_by_user_id" int NOT NULL,
  "company_id" int DEFAULT NULL,
  "note" text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_client_note_client_author" ("client_id","created_by_user_id"),
  KEY "IDX_client_note_client" ("client_id"),
  CONSTRAINT "FK_client_note_client" FOREIGN KEY ("client_id") REFERENCES "client" ("id") ON DELETE CASCADE
);

CREATE TABLE "commission_role" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "name" varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "IDX_commission_role_company" ("company_id"),
  CONSTRAINT "FK_commission_role_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "company" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) DEFAULT NULL,
  "location" varchar(255) DEFAULT NULL,
  "email" varchar(145) NOT NULL,
  "logo" varchar(245) DEFAULT NULL,
  "slug" varchar(160) DEFAULT NULL,
  "description" varchar(45) DEFAULT NULL,
  "user_id" int DEFAULT NULL,
  "manager_name" varchar(145) DEFAULT NULL,
  "instagram_url" varchar(245) DEFAULT NULL,
  "tiktok_url" varchar(245) DEFAULT NULL,
  "facebook_url" varchar(245) DEFAULT NULL,
  "phone" varchar(20) DEFAULT NULL,
  "birth_date" date DEFAULT NULL,
  "address" varchar(255) DEFAULT NULL,
  "allow_past_appointments" tinyint(1) NOT NULL DEFAULT '0',
  "allow_negative_stock" tinyint(1) NOT NULL DEFAULT '0',
  "identification" varchar(20) DEFAULT NULL,
  "deactivated_at" datetime DEFAULT NULL,
  "deactivated_by" int DEFAULT NULL,
  "deactivation_reason" varchar(255) DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_company_slug" ("slug"),
  KEY "IDX_company_identification" ("identification")
);

CREATE TABLE "company_booking_settings" (
  "company_id" int NOT NULL,
  "mode" varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free',
  "lead_minutes" int NOT NULL DEFAULT '60',
  "hold_hours" int NOT NULL DEFAULT '24',
  "workers_can_approve" tinyint NOT NULL DEFAULT '0',
  "deposit_type" varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "deposit_amount" decimal(12,2) DEFAULT NULL,
  "deposit_percent" int DEFAULT NULL,
  "deposit_currency" varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payment_instructions" varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("company_id"),
  CONSTRAINT "CHK_company_booking_settings_mode" CHECK ((`mode` in (_utf8mb4'free',_utf8mb4'approval',_utf8mb4'deposit')))
);

CREATE TABLE "company_category" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) NOT NULL,
  "company_id" int NOT NULL,
  PRIMARY KEY ("id"),
  KEY "FK_4ee20f3137301088c0475f1f826" ("company_id"),
  CONSTRAINT "FK_4ee20f3137301088c0475f1f826" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "company_feedback" (
  "id" int NOT NULL AUTO_INCREMENT,
  "stars" int DEFAULT NULL,
  "company_id" int NOT NULL,
  "client_id" int DEFAULT NULL,
  "description" text,
  "datetime" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "session_id" int DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_company_feedback_client_session" ("client_id","session_id","company_id"),
  KEY "FK_c1e47c5df403363ffb319d232a0" ("company_id"),
  CONSTRAINT "FK_c1e47c5df403363ffb319d232a0" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "company_portfolio_pictures" (
  "id" int NOT NULL AUTO_INCREMENT,
  "picture" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "company_id" int NOT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "IDX_company_portfolio_company_id" ("company_id")
);

CREATE TABLE "company_worker" (
  "id" int NOT NULL AUTO_INCREMENT,
  "worker_id" int NOT NULL,
  "company_id" int NOT NULL,
  "is_active" int DEFAULT NULL,
  "slug" varchar(160) DEFAULT NULL,
  "start_date" date DEFAULT NULL,
  "end_date" date DEFAULT NULL,
  "services_detail" json DEFAULT NULL,
  "user_id" int DEFAULT NULL,
  "calendar" json DEFAULT NULL,
  "temporarily_deleted" tinyint NOT NULL DEFAULT '0',
  "permanently_deleted" tinyint NOT NULL DEFAULT '0',
  "plan_suspended" tinyint NOT NULL DEFAULT '0',
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_company_worker_company_slug" ("company_id","slug"),
  KEY "FK_a5123813e7bff7f219db1a30d9d" ("worker_id"),
  KEY "FK_bbae9589657d49887666cd8ce15" ("company_id"),
  KEY "IDX_company_worker_company_updated" ("company_id","updated_at"),
  CONSTRAINT "FK_a5123813e7bff7f219db1a30d9d" FOREIGN KEY ("worker_id") REFERENCES "worker" ("id"),
  CONSTRAINT "FK_bbae9589657d49887666cd8ce15" FOREIGN KEY ("company_id") REFERENCES "company" ("id")
);

CREATE TABLE "direct_sale" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "client_id" int DEFAULT NULL,
  "method" varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "reference" varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "total_bs" decimal(14,2) DEFAULT NULL,
  "lines" json DEFAULT NULL,
  "collected_at" datetime DEFAULT NULL,
  "was_pending" tinyint NOT NULL DEFAULT '0',
  "company_adjustment_bs" decimal(14,2) DEFAULT NULL,
  "created_by_user_id" int DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "IDX_direct_sale_company" ("company_id")
);

CREATE TABLE "email_opt_out" (
  "email" varchar(245) NOT NULL,
  "opted_out_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("email")
);

CREATE TABLE "fcm_tokens" (
  "id" int NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "token" varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "platform" varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_fcm_tokens_token" ("token"),
  KEY "IDX_fcm_tokens_user" ("user_id"),
  CONSTRAINT "FK_fcm_tokens_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "ia_prompts" (
  "id" int NOT NULL AUTO_INCREMENT,
  "text" text NOT NULL,
  "tipo" varchar(5) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "idempotency_key" (
  "id" int NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "idem_key" char(36) NOT NULL,
  "endpoint" varchar(100) NOT NULL,
  "request_hash" char(64) NOT NULL,
  "status" varchar(12) NOT NULL,
  "response_status" smallint DEFAULT NULL,
  "response_body" mediumtext,
  "created_at" datetime NOT NULL,
  "completed_at" datetime DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_idempotency_key_user_key" ("user_id","idem_key"),
  KEY "IDX_idempotency_key_created" ("created_at"),
  CONSTRAINT "FK_idempotency_key_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "impersonation_session" (
  "id" int NOT NULL AUTO_INCREMENT,
  "actor_user_id" int NOT NULL COMMENT 'El padm que pidió el acceso',
  "actor_email" varchar(245) DEFAULT NULL COMMENT 'Copia del correo del operador en ese momento',
  "target_user_id" int NOT NULL COMMENT 'El dueño (adm) en cuyo nombre se actúa',
  "company_id" int NOT NULL,
  "ticket_hash" char(64) DEFAULT NULL COMMENT 'SHA-256 del vale de un solo uso. NULL una vez canjeado',
  "ticket_expires_at" datetime NOT NULL,
  "ticket_used_at" datetime DEFAULT NULL,
  "token_hash" char(64) DEFAULT NULL COMMENT 'SHA-256 del JWT emitido. Permite revocarlo sin tenerlo',
  "token_expires_at" datetime DEFAULT NULL,
  "started_at" datetime DEFAULT NULL COMMENT 'Cuándo se canjeó el ticket',
  "ended_at" datetime DEFAULT NULL,
  "ended_reason" varchar(16) DEFAULT NULL COMMENT 'manual | revoked | expired',
  "ip" varchar(45) DEFAULT NULL,
  "user_agent" varchar(255) DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_impersonation_ticket" ("ticket_hash"),
  KEY "IDX_impersonation_active" ("ended_at","token_expires_at"),
  KEY "IDX_impersonation_company" ("company_id","created_at")
);

CREATE TABLE "migrations" (
  "id" int NOT NULL AUTO_INCREMENT,
  "timestamp" bigint NOT NULL,
  "name" varchar(255) NOT NULL,
  PRIMARY KEY ("id")
);

CREATE TABLE "notification_reminders" (
  "id" int NOT NULL AUTO_INCREMENT,
  "type" varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "reference_id" int NOT NULL,
  "sent_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_notification_reminders_type_ref" ("type","reference_id")
);

CREATE TABLE "notifications" (
  "id" int NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "type" varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "title" varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "body" text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "data" json DEFAULT NULL,
  "read" tinyint(1) NOT NULL DEFAULT '0',
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "IDX_notifications_user" ("user_id"),
  KEY "IDX_notifications_user_read" ("user_id","read"),
  CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "offer" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(255) NOT NULL,
  "logo" varchar(500) DEFAULT NULL,
  "description" text,
  "status" tinyint NOT NULL DEFAULT '1',
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "company_id" int NOT NULL,
  PRIMARY KEY ("id"),
  KEY "FK_7d1cbe435c8a0ff1e35adca2832" ("company_id"),
  CONSTRAINT "FK_7d1cbe435c8a0ff1e35adca2832" FOREIGN KEY ("company_id") REFERENCES "company" ("id")
);

CREATE TABLE "onboarding_rescue_notification" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "step" varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  "level" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  "channel" varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  "days_stalled" int NOT NULL DEFAULT '0',
  "sent_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_rescue_company_step_level_channel" ("company_id","step","level","channel"),
  KEY "IDX_rescue_sent_at" ("sent_at"),
  CONSTRAINT "FK_rescue_notification_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "onboarding_rubro_template" (
  "id" int NOT NULL AUTO_INCREMENT,
  "rubro_key" varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  "rubro_name" varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  "template" json NOT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  "sort_order" int NOT NULL DEFAULT '0',
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_rubro_template_key" ("rubro_key"),
  KEY "IDX_rubro_template_active" ("is_active","sort_order")
);

CREATE TABLE "onboarding_state" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "global_status" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  "steps" json NOT NULL,
  "wizard_step" varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "start_choice" varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "first_charge_at" datetime DEFAULT NULL,
  "started_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" datetime DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_onboarding_state_company" ("company_id"),
  KEY "IDX_onboarding_status" ("global_status"),
  KEY "IDX_onboarding_status_updated" ("global_status","updated_at"),
  CONSTRAINT "FK_onboarding_state_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "panel_contact_log" (
  "id" int NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "channel" varchar(20) NOT NULL,
  "outcome" varchar(20) NOT NULL,
  "note" varchar(1000) DEFAULT NULL,
  "follow_up_on" date DEFAULT NULL,
  "contacted_at" datetime NOT NULL,
  "created_by" int DEFAULT NULL,
  "created_at" datetime NOT NULL,
  "updated_at" datetime NOT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_panel_contact_log_user_date" ("user_id","contacted_at"),
  CONSTRAINT "FK_panel_contact_log_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "panel_hidden_owner" (
  "user_id" int NOT NULL,
  "hidden_by" int DEFAULT NULL,
  "hidden_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id"),
  CONSTRAINT "FK_panel_hidden_owner_user" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "payment_gateway_event" (
  "id" int NOT NULL AUTO_INCREMENT,
  "provider" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cobrix',
  "channel" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'invoice',
  "event_id" varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  "event_type" varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  "payment_report_id" int DEFAULT NULL,
  "invoice_id" int DEFAULT NULL,
  "provider_reference" varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "outcome" varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'received',
  "detail" varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payload" json NOT NULL,
  "received_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" datetime DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_payment_gateway_event" ("provider","event_id"),
  KEY "IDX_payment_gateway_event_report" ("payment_report_id"),
  KEY "FK_payment_gateway_event_invoice" ("invoice_id"),
  CONSTRAINT "FK_payment_gateway_event_invoice" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoice" ("id") ON DELETE SET NULL,
  CONSTRAINT "FK_payment_gateway_event_report" FOREIGN KEY ("payment_report_id") REFERENCES "payment_report" ("id") ON DELETE SET NULL
);

CREATE TABLE "payment_report" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "subscription_id" int NOT NULL,
  "plan_id" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  "method" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pago_movil',
  "amount_ves_minor" bigint DEFAULT NULL,
  "amount_usd_minor" bigint DEFAULT NULL,
  "currency" varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  "frozen_rate" decimal(18,4) DEFAULT NULL,
  "quoted_at" datetime DEFAULT NULL,
  "reference" varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  "payer_phone" varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payer_bank_code" varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payer_email" varchar(145) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "proof_url" varchar(245) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "reported_at" datetime NOT NULL,
  "status" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reported',
  "verification_method" varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "verified_by_user_id" int DEFAULT NULL,
  "verified_at" datetime DEFAULT NULL,
  "rejection_reason" varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "network" varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "note" varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "active_reference" varchar(64) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'rejected') then NULL else `reference` end)) STORED,
  "auto_check_status" varchar(12) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "auto_check_at" datetime DEFAULT NULL,
  "auto_check_reason" varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "gateway_payment_id" varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payer_identification" varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "invoice_id" int DEFAULT NULL,
  "covered_from" datetime DEFAULT NULL COMMENT 'Inicio del ciclo que pagó. Congelado al verificar',
  "covered_to" datetime DEFAULT NULL COMMENT 'Fin del ciclo que pagó. Es el current_period_end que dejó',
  "kind" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'regular',
  "offer_id" varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "months" tinyint unsigned NOT NULL DEFAULT '1',
  "price_usd_minor" int DEFAULT NULL,
  "promo_slot" varchar(48) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS ((case when ((`offer_id` is not null) and (`status` <> _utf8mb4'rejected')) then concat(substring_index(`offer_id`,_utf8mb4'_',1),_utf8mb4':',`kind`) else NULL end)) STORED,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_payment_report_company_active_reference" ("company_id","active_reference"),
  UNIQUE KEY "UQ_payment_report_company_promo_slot" ("company_id","promo_slot"),
  KEY "IDX_payment_report_company_status" ("company_id","status"),
  KEY "IDX_payment_report_reference" ("reference"),
  KEY "FK_payment_report_subscription" ("subscription_id"),
  KEY "FK_payment_report_verified_by" ("verified_by_user_id"),
  KEY "FK_payment_report_invoice" ("invoice_id"),
  KEY "IDX_payment_report_auto_check" ("status","auto_check_status","reported_at"),
  KEY "IDX_payment_report_company_reported" ("company_id","reported_at"),
  CONSTRAINT "FK_payment_report_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_payment_report_invoice" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoice" ("id") ON DELETE SET NULL,
  CONSTRAINT "FK_payment_report_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscription" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_payment_report_verified_by" FOREIGN KEY ("verified_by_user_id") REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT "CHK_payment_report_amount_present" CHECK ((((`currency` = _utf8mb4'VES') and (`amount_ves_minor` is not null)) or ((`currency` = _utf8mb4'USD') and (`amount_usd_minor` is not null)))),
  CONSTRAINT "CHK_payment_report_amounts_positive" CHECK ((((`amount_ves_minor` is null) or (`amount_ves_minor` > 0)) and ((`amount_usd_minor` is null) or (`amount_usd_minor` > 0)))),
  CONSTRAINT "CHK_payment_report_auto_check_status" CHECK (((`auto_check_status` is null) or (`auto_check_status` in (_utf8mb4'pending',_utf8mb4'approved',_utf8mb4'rejected',_utf8mb4'unsupported',_utf8mb4'expired')))),
  CONSTRAINT "CHK_payment_report_currency" CHECK ((`currency` in (_utf8mb4'VES',_utf8mb4'USD'))),
  CONSTRAINT "CHK_payment_report_method" CHECK ((`method` in (_utf8mb4'pago_movil',_utf8mb4'binance',_utf8mb4'paypal'))),
  CONSTRAINT "CHK_payment_report_status" CHECK ((`status` in (_utf8mb4'reported',_utf8mb4'verified',_utf8mb4'rejected'))),
  CONSTRAINT "CHK_payment_report_verification_method" CHECK (((`verification_method` is null) or (`verification_method` in (_utf8mb4'auto',_utf8mb4'manual'))))
);

CREATE TABLE "payout" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "period_detail_id" int NOT NULL,
  "amount_minor" bigint NOT NULL,
  "method" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "reference" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "recorded_by_user_id" int NOT NULL,
  "paid_at" datetime NOT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "currency" varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VES',
  PRIMARY KEY ("id"),
  KEY "IDX_payout_company" ("company_id"),
  KEY "IDX_payout_period_detail" ("period_detail_id"),
  CONSTRAINT "FK_payout_period_detail" FOREIGN KEY ("period_detail_id") REFERENCES "period_detail" ("id") ON DELETE RESTRICT
);

CREATE TABLE "payroll_concept" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "period_detail_id" int NOT NULL,
  "type" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "sign" tinyint NOT NULL,
  "label" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "amount_minor" bigint NOT NULL,
  "source_type" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "source_id" int DEFAULT NULL,
  "created_by_user_id" int DEFAULT NULL,
  "metadata" json DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "currency" varchar(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VES',
  "amount_bs_minor" bigint DEFAULT NULL,
  "occurred_at" datetime DEFAULT NULL,
  "exchange_rate" decimal(18,4) DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_concept_source" ("source_type","source_id","type","period_detail_id","currency"),
  KEY "IDX_payroll_concept_company" ("company_id"),
  KEY "IDX_payroll_concept_source" ("source_type","source_id"),
  KEY "FK_concept_period_detail" ("period_detail_id"),
  CONSTRAINT "FK_concept_period_detail" FOREIGN KEY ("period_detail_id") REFERENCES "period_detail" ("id") ON DELETE CASCADE
);

CREATE TABLE "payroll_config" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "frequency" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'quincenal',
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_payroll_config_company" ("company_id")
);

CREATE TABLE "payroll_period" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "label" varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "status" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  "frequency" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "starts_at" datetime NOT NULL,
  "ends_at" datetime NOT NULL,
  "approved_by_user_id" int DEFAULT NULL,
  "approved_at" datetime DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "open_marker" int GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'open') then `company_id` else NULL end)) VIRTUAL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_payroll_period_one_open" ("open_marker"),
  KEY "IDX_payroll_period_company_status" ("company_id","status")
);

CREATE TABLE "period_detail" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "period_id" int NOT NULL,
  "company_worker_id" int NOT NULL,
  "earned_minor" bigint NOT NULL DEFAULT '0',
  "deducted_minor" bigint NOT NULL DEFAULT '0',
  "net_minor" bigint NOT NULL DEFAULT '0',
  "paid_minor" bigint NOT NULL DEFAULT '0',
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_period_detail_period_worker" ("period_id","company_worker_id"),
  KEY "IDX_period_detail_company_period" ("company_id","period_id"),
  CONSTRAINT "FK_period_detail_period" FOREIGN KEY ("period_id") REFERENCES "payroll_period" ("id") ON DELETE CASCADE
);

CREATE TABLE "period_detail_currency" (
  "id" int NOT NULL AUTO_INCREMENT,
  "period_detail_id" int NOT NULL,
  "currency" varchar(3) NOT NULL,
  "earned_minor" bigint NOT NULL DEFAULT '0',
  "deducted_minor" bigint NOT NULL DEFAULT '0',
  "net_minor" bigint NOT NULL DEFAULT '0',
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_period_detail_currency" ("period_detail_id","currency"),
  KEY "IDX_pdc_detail" ("period_detail_id")
);

CREATE TABLE "portfolio_pictures" (
  "id" int NOT NULL AUTO_INCREMENT,
  "picture" varchar(145) DEFAULT NULL,
  "worker_id" int NOT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id","worker_id")
);

CREATE TABLE "product" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "category_id" int NOT NULL,
  "name" varchar(145) NOT NULL,
  "currency" varchar(10) NOT NULL DEFAULT 'VES',
  "sale_price_minor" bigint NOT NULL,
  "stock" int NOT NULL DEFAULT '0',
  "applies_commission" tinyint NOT NULL DEFAULT '0',
  "commission_bps" int DEFAULT NULL,
  "is_active" tinyint(1) NOT NULL DEFAULT '1',
  "cost_minor" bigint NOT NULL DEFAULT '0',
  "commission_mode" varchar(12) NOT NULL DEFAULT 'percentage',
  "commission_fixed_minor" bigint NOT NULL DEFAULT '0',
  PRIMARY KEY ("id"),
  KEY "FK_product_company" ("company_id"),
  KEY "FK_product_category" ("category_id"),
  CONSTRAINT "FK_product_category" FOREIGN KEY ("category_id") REFERENCES "product_category" ("id"),
  CONSTRAINT "FK_product_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "product_category" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) NOT NULL,
  "company_id" int NOT NULL,
  "default_commission_bps" int DEFAULT NULL,
  "is_active" tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY ("id"),
  KEY "FK_product_category_company" ("company_id"),
  CONSTRAINT "FK_product_category_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "product_stock_movement" (
  "id" int NOT NULL AUTO_INCREMENT,
  "product_id" int NOT NULL,
  "delta" int NOT NULL,
  "resulting_stock" int NOT NULL,
  "reason" varchar(255) DEFAULT NULL,
  "created_by_user_id" int DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "IDX_product_stock_movement_product" ("product_id"),
  CONSTRAINT "FK_product_stock_movement_product" FOREIGN KEY ("product_id") REFERENCES "product" ("id") ON DELETE CASCADE
);

CREATE TABLE "public_booking_request" (
  "id" int NOT NULL AUTO_INCREMENT,
  "session_id" int NOT NULL,
  "company_id" int NOT NULL,
  "status" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  "guest_name" varchar(145) COLLATE utf8mb4_unicode_ci NOT NULL,
  "guest_email" varchar(145) COLLATE utf8mb4_unicode_ci NOT NULL,
  "guest_phone" varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "guest_identification" varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "is_new_account" tinyint NOT NULL DEFAULT '0',
  "expires_at" datetime DEFAULT NULL,
  "deposit_amount" decimal(12,2) DEFAULT NULL,
  "deposit_currency" varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payment_reference" varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "payment_proof_url" varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "rejection_reason" varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "reviewed_by_user_id" int DEFAULT NULL,
  "reviewed_at" datetime DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_public_booking_request_session" ("session_id"),
  KEY "IDX_public_booking_request_company_status" ("company_id","status"),
  KEY "IDX_public_booking_request_expires" ("status","expires_at"),
  CONSTRAINT "CHK_public_booking_request_status" CHECK ((`status` in (_utf8mb4'confirmed',_utf8mb4'pending_approval',_utf8mb4'pending_payment',_utf8mb4'rejected',_utf8mb4'expired')))
);

CREATE TABLE "reminder_log" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "tier" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  "period_end" datetime NOT NULL,
  "channel" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  "sent_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  KEY "IDX_reminder_log_company_tier_period" ("company_id","tier","period_end"),
  CONSTRAINT "FK_reminder_log_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "service" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) DEFAULT NULL,
  "cost" decimal(10,4) DEFAULT NULL,
  "standard_time" int DEFAULT NULL,
  "company_id" int NOT NULL,
  "workers" json DEFAULT NULL,
  "currency" varchar(10) DEFAULT 'VES',
  "description" text,
  "percentage" decimal(10,0) DEFAULT NULL,
  "status" int DEFAULT '1',
  "category_id" int DEFAULT NULL,
  "for_community" tinyint(1) NOT NULL DEFAULT '0',
  "source_template_key" varchar(64) DEFAULT NULL,
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "FK_9d513b39d251063f98f2a7b941d" ("category_id"),
  KEY "IDX_service_source_template" ("company_id","source_template_key"),
  KEY "IDX_service_company_updated" ("company_id","updated_at"),
  CONSTRAINT "FK_9d513b39d251063f98f2a7b941d" FOREIGN KEY ("category_id") REFERENCES "service_category" ("id")
);

CREATE TABLE "service_category" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) NOT NULL,
  "company_id" int NOT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  "description" text,
  "source_template_key" varchar(64) DEFAULT NULL,
  PRIMARY KEY ("id"),
  KEY "FK_5015996724351d05c61ea6b2faf" ("company_id"),
  KEY "IDX_service_category_source_template" ("company_id","source_template_key"),
  CONSTRAINT "FK_5015996724351d05c61ea6b2faf" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE
);

CREATE TABLE "service_feedback" (
  "id" int NOT NULL AUTO_INCREMENT,
  "stars" int DEFAULT NULL,
  "description" text,
  "datetime" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "service_id" int NOT NULL,
  "client_id" int DEFAULT NULL,
  PRIMARY KEY ("id"),
  KEY "FK_5a8acb9e7aec6dbf2dfb5c058ad" ("service_id"),
  CONSTRAINT "FK_5a8acb9e7aec6dbf2dfb5c058ad" FOREIGN KEY ("service_id") REFERENCES "service" ("id") ON DELETE CASCADE
);

CREATE TABLE "service_offer" (
  "id" int NOT NULL AUTO_INCREMENT,
  "service_id" int NOT NULL,
  "offer_id" int NOT NULL,
  "price" decimal(10,2) NOT NULL,
  PRIMARY KEY ("id"),
  KEY "FK_98cc54c8205fe7b5cd3aef4b181" ("service_id"),
  KEY "FK_32a15e610b861a44e3e72c01db8" ("offer_id"),
  CONSTRAINT "FK_32a15e610b861a44e3e72c01db8" FOREIGN KEY ("offer_id") REFERENCES "offer" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_98cc54c8205fe7b5cd3aef4b181" FOREIGN KEY ("service_id") REFERENCES "service" ("id")
);

CREATE TABLE "session" (
  "id" int NOT NULL AUTO_INCREMENT,
  "client_id" int NOT NULL,
  "session_datetime" datetime DEFAULT NULL,
  "session_status" int DEFAULT NULL,
  "total_cost" decimal(10,2) DEFAULT NULL,
  "total_time" int DEFAULT NULL,
  "ia_response" json DEFAULT NULL,
  "start_datetime" datetime DEFAULT NULL,
  "status" int DEFAULT NULL,
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  "extra_services" json DEFAULT NULL,
  "description" mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "description_ia" mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "status_locked" tinyint NOT NULL DEFAULT '0',
  "cancellation_reason" text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "cancelled_by" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "attendance_status" tinyint NOT NULL DEFAULT '0',
  "attendance_responded_at" datetime DEFAULT NULL,
  "original_start_datetime" datetime DEFAULT NULL,
  "feedback_skipped_at" datetime DEFAULT NULL,
  "public_code" varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "created_offline_at" datetime DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_session_public_code" ("public_code"),
  KEY "IDX_session_client_updated" ("client_id","updated_at")
);

CREATE TABLE "session_detail" (
  "id" int NOT NULL AUTO_INCREMENT,
  "cost" decimal(10,4) DEFAULT NULL,
  "service_id" int NOT NULL,
  "company_worker_id" int DEFAULT NULL,
  "session_id" int NOT NULL,
  "start_datetime" datetime DEFAULT NULL,
  "total_time" int DEFAULT NULL,
  "total_worker" decimal(10,4) DEFAULT NULL,
  "total_company" decimal(10,4) DEFAULT NULL,
  "status" int DEFAULT NULL,
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  "is_extra" tinyint NOT NULL DEFAULT '0',
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "end_datetime" datetime DEFAULT NULL,
  "description_worker" mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "description_ia" mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "description" mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "offer_id" int DEFAULT NULL,
  "cancel_reason" text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  "cancelled_by" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "original_start_datetime" datetime DEFAULT NULL,
  "original_end_datetime" datetime DEFAULT NULL,
  "is_courtesy" tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY ("id","service_id","session_id"),
  KEY "fk_session_detail_company_worker1" ("company_worker_id"),
  KEY "IDX_session_detail_worker_updated" ("company_worker_id","updated_at"),
  CONSTRAINT "fk_session_detail_company_worker1" FOREIGN KEY ("company_worker_id") REFERENCES "company_worker" ("id")
);

CREATE TABLE "session_payment_lines" (
  "id" int NOT NULL AUTO_INCREMENT,
  "payment_id" int NOT NULL,
  "currency" varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "subtotal" decimal(18,2) NOT NULL,
  "exchange_rate" decimal(18,4) DEFAULT NULL,
  "subtotal_bs" decimal(18,2) DEFAULT NULL,
  "method" varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_session_payment_lines_payment_id" ("payment_id")
);

CREATE TABLE "session_payment_reversal" (
  "id" int NOT NULL AUTO_INCREMENT,
  "session_id" int NOT NULL,
  "company_id" int NOT NULL,
  "reverted_by_user_id" int NOT NULL,
  "reason" varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  "payment_snapshot" json NOT NULL,
  "concepts_snapshot" json DEFAULT NULL,
  "products_snapshot" json DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  KEY "IDX_payment_reversal_session" ("session_id"),
  KEY "IDX_payment_reversal_company" ("company_id")
);

CREATE TABLE "session_payment_tips" (
  "id" int NOT NULL AUTO_INCREMENT,
  "payment_id" int NOT NULL,
  "company_worker_id" int NOT NULL,
  "amount" decimal(18,2) NOT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_session_payment_tips_payment_id" ("payment_id"),
  KEY "IDX_session_payment_tips_company_worker_id" ("company_worker_id")
);

CREATE TABLE "session_payments" (
  "id" int NOT NULL AUTO_INCREMENT,
  "session_id" int NOT NULL,
  "method" varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "reference" varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "tip_currency" varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "tip" decimal(18,2) DEFAULT NULL,
  "tip_exchange_rate" decimal(18,4) DEFAULT NULL,
  "tip_bs" decimal(18,2) DEFAULT NULL,
  "total_bs" decimal(18,2) DEFAULT NULL,
  "paid_by" int NOT NULL,
  "paid_at" datetime NOT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "collected_at" datetime DEFAULT NULL,
  "was_pending" tinyint(1) NOT NULL DEFAULT '0',
  "company_adjustment_bs" decimal(18,2) DEFAULT NULL,
  "attributions" json DEFAULT NULL,
  "discounts" json DEFAULT NULL,
  "company_cash_minor" bigint DEFAULT NULL,
  "company_cash_currency" varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_session_payments_session_id" ("session_id"),
  KEY "IDX_session_payments_paid_at" ("paid_at")
);

CREATE TABLE "session_product" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "session_id" int DEFAULT NULL,
  "product_id" int NOT NULL,
  "quantity" int NOT NULL,
  "unit_price_minor" bigint NOT NULL,
  "currency" varchar(10) NOT NULL DEFAULT 'VES',
  "seller_employee_id" int DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "sale_type" varchar(20) NOT NULL DEFAULT 'client',
  "buyer_employee_id" int DEFAULT NULL,
  "cost_minor" bigint NOT NULL DEFAULT '0',
  "commission_minor" bigint NOT NULL DEFAULT '0',
  "direct_sale_id" int DEFAULT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_session_product_session" ("session_id"),
  KEY "IDX_session_product_company" ("company_id"),
  KEY "FK_session_product_product" ("product_id"),
  KEY "FK_session_product_seller" ("seller_employee_id"),
  KEY "FK_session_product_direct_sale" ("direct_sale_id"),
  CONSTRAINT "FK_session_product_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_session_product_direct_sale" FOREIGN KEY ("direct_sale_id") REFERENCES "direct_sale" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_session_product_product" FOREIGN KEY ("product_id") REFERENCES "product" ("id"),
  CONSTRAINT "FK_session_product_seller" FOREIGN KEY ("seller_employee_id") REFERENCES "company_worker" ("id") ON DELETE SET NULL,
  CONSTRAINT "FK_session_product_session" FOREIGN KEY ("session_id") REFERENCES "session" ("id") ON DELETE CASCADE
);

CREATE TABLE "site_category" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  "slug" varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_site_category_slug" ("slug")
);

CREATE TABLE "standing_commission" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "company_worker_id" int DEFAULT NULL,
  "scope" enum('all_services','service') COLLATE utf8mb4_unicode_ci NOT NULL,
  "service_id" int DEFAULT NULL,
  "is_exclusion" tinyint NOT NULL DEFAULT '0',
  "basis_mode" enum('percentage','fixed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "value" int DEFAULT NULL,
  "currency" varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  "commission_role_id" int DEFAULT NULL,
  PRIMARY KEY ("id"),
  KEY "IDX_standing_commission_company" ("company_id"),
  KEY "IDX_standing_commission_worker" ("company_worker_id"),
  KEY "IDX_standing_commission_service" ("service_id"),
  KEY "IDX_standing_commission_role" ("commission_role_id"),
  CONSTRAINT "FK_standing_commission_role" FOREIGN KEY ("commission_role_id") REFERENCES "commission_role" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_standing_commission_service" FOREIGN KEY ("service_id") REFERENCES "service" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_standing_commission_worker" FOREIGN KEY ("company_worker_id") REFERENCES "company_worker" ("id") ON DELETE CASCADE
);

CREATE TABLE "subscription" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "plan_id" varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Plan elegido; NULL mientras el dueño no haya pagado ninguno',
  "status" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'trialing',
  "trial_ends_at" datetime DEFAULT NULL,
  "current_period_end" datetime DEFAULT NULL,
  "grace_ends_at" datetime DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  "billing_exempt" tinyint NOT NULL DEFAULT '0' COMMENT 'No se le cobra: acceso permanente con su plan, sin vencimiento ni bloqueo',
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_subscription_company" ("company_id"),
  KEY "IDX_subscription_status_period" ("status","current_period_end"),
  CONSTRAINT "FK_subscription_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE,
  CONSTRAINT "CHK_subscription_status" CHECK ((`status` in (_utf8mb4'trialing',_utf8mb4'active',_utf8mb4'grace',_utf8mb4'blocked')))
);

CREATE TABLE "subscription_event" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "subscription_id" int NOT NULL,
  "payment_report_id" int DEFAULT NULL,
  "type" varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  "plan_id" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  "previous_status" varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "new_status" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  "previous_period_end" datetime DEFAULT NULL,
  "new_period_end" datetime NOT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_subscription_event_report" ("payment_report_id"),
  KEY "IDX_subscription_event_company" ("company_id","created_at"),
  KEY "FK_subscription_event_subscription" ("subscription_id"),
  CONSTRAINT "FK_subscription_event_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_subscription_event_report" FOREIGN KEY ("payment_report_id") REFERENCES "payment_report" ("id") ON DELETE SET NULL,
  CONSTRAINT "FK_subscription_event_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscription" ("id") ON DELETE CASCADE
);

CREATE TABLE "subscription_invoice" (
  "id" int NOT NULL AUTO_INCREMENT,
  "company_id" int NOT NULL,
  "subscription_id" int NOT NULL,
  "plan_id" varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  "provider" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cobrix',
  "provider_reference" varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  "provider_invoice_id" varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "checkout_url" varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "amount_minor" bigint NOT NULL,
  "currency" varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  "frozen_rate" decimal(18,4) DEFAULT NULL,
  "quoted_at" datetime DEFAULT NULL,
  "payer_identification" varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  "status" varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  "expires_at" datetime NOT NULL,
  "paid_at" datetime DEFAULT NULL,
  "provider_payload" json DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind" varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'regular',
  "offer_id" varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  "months" tinyint unsigned NOT NULL DEFAULT '1',
  "price_usd_minor" int DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_subscription_invoice_reference" ("provider_reference"),
  KEY "IDX_subscription_invoice_company" ("company_id","status"),
  KEY "FK_subscription_invoice_subscription" ("subscription_id"),
  CONSTRAINT "FK_subscription_invoice_company" FOREIGN KEY ("company_id") REFERENCES "company" ("id") ON DELETE CASCADE,
  CONSTRAINT "FK_subscription_invoice_subscription" FOREIGN KEY ("subscription_id") REFERENCES "subscription" ("id") ON DELETE CASCADE
);

CREATE TABLE "user" (
  "id" int NOT NULL AUTO_INCREMENT,
  "username" varchar(145) DEFAULT NULL,
  "email" varchar(245) DEFAULT NULL,
  "password" varchar(250) DEFAULT NULL,
  "user_type" varchar(5) DEFAULT NULL,
  "last_login" datetime DEFAULT NULL,
  "last_logout" datetime DEFAULT NULL,
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  "email_verified" tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY ("id")
);

CREATE TABLE "user_verification_codes" (
  "id" int NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "code" varchar(6) NOT NULL,
  "expires_at" datetime NOT NULL,
  "used" tinyint NOT NULL DEFAULT '0',
  "code_type" varchar(50) NOT NULL DEFAULT 'email_verification',
  "created_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "attempts" int NOT NULL DEFAULT '0',
  PRIMARY KEY ("id"),
  KEY "FK_b75324c1b0a81ae2635d727cf07" ("user_id"),
  CONSTRAINT "FK_b75324c1b0a81ae2635d727cf07" FOREIGN KEY ("user_id") REFERENCES "user" ("id")
);

CREATE TABLE "web_handoff_ticket" (
  "id" int NOT NULL AUTO_INCREMENT,
  "user_id" int NOT NULL,
  "ticket_hash" varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  "expires_at" datetime NOT NULL,
  "used_at" datetime DEFAULT NULL,
  "created_at" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_web_handoff_ticket_hash" ("ticket_hash"),
  KEY "IDX_web_handoff_ticket_user" ("user_id")
);

CREATE TABLE "worker" (
  "id" int NOT NULL AUTO_INCREMENT,
  "name" varchar(145) DEFAULT NULL,
  "address" varchar(145) DEFAULT NULL,
  "birthdate" date DEFAULT NULL,
  "description" text,
  "user_id" int DEFAULT NULL,
  "phone" varchar(20) DEFAULT NULL,
  "is_active" tinyint NOT NULL DEFAULT '1',
  "location" varchar(145) DEFAULT NULL,
  "picture" varchar(255) DEFAULT NULL,
  "instagram_url" varchar(245) DEFAULT NULL,
  "tiktok_url" varchar(245) DEFAULT NULL,
  "facebook_url" varchar(245) DEFAULT NULL,
  "identification" varchar(20) DEFAULT NULL,
  "updated_at" datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY ("id"),
  UNIQUE KEY "REL_ea2f25edbbd2a3030f7c526b29" ("user_id"),
  KEY "IDX_worker_identification" ("identification"),
  CONSTRAINT "FK_ea2f25edbbd2a3030f7c526b297" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "worker_feedback" (
  "id" int NOT NULL AUTO_INCREMENT,
  "stars" int DEFAULT NULL,
  "worker_id" int NOT NULL,
  "client_id" int DEFAULT NULL,
  "description" text,
  "datetime" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "session_id" int DEFAULT NULL,
  "company_worker_id" int DEFAULT NULL,
  PRIMARY KEY ("id"),
  UNIQUE KEY "UQ_worker_feedback_client_session" ("client_id","session_id","company_worker_id"),
  KEY "FK_36986eaf5271a4b8b734ab07b24" ("worker_id"),
  CONSTRAINT "FK_36986eaf5271a4b8b734ab07b24" FOREIGN KEY ("worker_id") REFERENCES "worker" ("id") ON DELETE CASCADE
);

INSERT INTO migrations (timestamp, name) VALUES (1766087155639, 'AddColumnUser1766087155639');
INSERT INTO migrations (timestamp, name) VALUES (1766167286133, 'AddColumnWorkerAndUser1766167286133');
INSERT INTO migrations (timestamp, name) VALUES (1767637435755, 'DeleteColumnWorkerId1767637435755');
INSERT INTO migrations (timestamp, name) VALUES (1767638984497, 'AddColumnsClient1767638984497');
INSERT INTO migrations (timestamp, name) VALUES (1767640039856, 'UpdateColumnsClient1767640039856');
INSERT INTO migrations (timestamp, name) VALUES (1767644980829, 'AddVerification1767644980829');
INSERT INTO migrations (timestamp, name) VALUES (1767714186997, 'CreateBlackList1767714186997');
INSERT INTO migrations (timestamp, name) VALUES (1767884309052, 'AddColumnPhone1767884309052');
INSERT INTO migrations (timestamp, name) VALUES (1767889469560, 'AddColumnCalendar1767889469560');
INSERT INTO migrations (timestamp, name) VALUES (1768240453148, 'AddIsActiveWorker1768240453148');
INSERT INTO migrations (timestamp, name) VALUES (1768242036097, 'AddLocationWorker1768242036097');
INSERT INTO migrations (timestamp, name) VALUES (1768316612878, 'AddFieldsServices1768316612878');
INSERT INTO migrations (timestamp, name) VALUES (1768498999750, 'AddFieldsClient1768498999750');
INSERT INTO migrations (timestamp, name) VALUES (1769545554943, 'AddFieldsCompany1769545554943');
INSERT INTO migrations (timestamp, name) VALUES (1769702568929, 'FixSession1769702568929');
INSERT INTO migrations (timestamp, name) VALUES (1769702822283, 'FixSessionDetails1769702822283');
INSERT INTO migrations (timestamp, name) VALUES (1769711283878, 'AddUpdate1769711283878');
INSERT INTO migrations (timestamp, name) VALUES (1769715154612, 'AddFieldsSessionDetaild1769715154612');
INSERT INTO migrations (timestamp, name) VALUES (1770321567828, 'AddFieldsCompany1770321567828');
INSERT INTO migrations (timestamp, name) VALUES (1770386206642, 'DeleteFieldsSessionDetail1770386206642');
INSERT INTO migrations (timestamp, name) VALUES (1770391737803, 'AddFieldsCompanyWorker1770391737803');
INSERT INTO migrations (timestamp, name) VALUES (1770393132858, 'AddDeleteFieldsClient1770393132858');
INSERT INTO migrations (timestamp, name) VALUES (1770399879913, 'AddPictureLength1770399879913');
INSERT INTO migrations (timestamp, name) VALUES (1770405275464, 'DeleteIspublic1770405275464');
INSERT INTO migrations (timestamp, name) VALUES (1770647831954, 'AddCalendarCompany1770647831954');
INSERT INTO migrations (timestamp, name) VALUES (1770652518085, 'AddServiceExtra1770652518085');
INSERT INTO migrations (timestamp, name) VALUES (1770654492835, 'AddCalendarCompanyFix1770654492835');
INSERT INTO migrations (timestamp, name) VALUES (1770661455830, 'AddSessionFix1770661455830');
INSERT INTO migrations (timestamp, name) VALUES (1770749510478, 'AddFieldsWorkerF1770749510478');
INSERT INTO migrations (timestamp, name) VALUES (1770751544175, 'AddFieldsWorkerFeedback1770751544175');
INSERT INTO migrations (timestamp, name) VALUES (1770756765453, 'AddFieldsWorkerCompany1770756765453');
INSERT INTO migrations (timestamp, name) VALUES (1770833625088, 'AddFieldsEndDate1770833625088');
INSERT INTO migrations (timestamp, name) VALUES (1770911781186, 'AddDescriptionSessionDetail1770911781186');
INSERT INTO migrations (timestamp, name) VALUES (1770913252980, 'FixSession1770913252980');
INSERT INTO migrations (timestamp, name) VALUES (1770921515656, 'AddFieldsPortfolio1770921515656');
INSERT INTO migrations (timestamp, name) VALUES (1770927011615, 'AddIAPROMP1770927011615');
INSERT INTO migrations (timestamp, name) VALUES (1771460721072, 'AddServiceCategory1771460721072');
INSERT INTO migrations (timestamp, name) VALUES (1772473573222, 'AddCompanyCategory1772473573222');
INSERT INTO migrations (timestamp, name) VALUES (1772548980299, 'FixSessionDetaild1772548980299');
INSERT INTO migrations (timestamp, name) VALUES (1772556243916, 'CreateOffer1772556243916');
INSERT INTO migrations (timestamp, name) VALUES (1772562214783, 'AddFieldsOffer1772562214783');
INSERT INTO migrations (timestamp, name) VALUES (1772726961804, 'AddFieldsOfferId1772726961804');
INSERT INTO migrations (timestamp, name) VALUES (1772800000000, 'AddBirthDateCompany1772800000000');
INSERT INTO migrations (timestamp, name) VALUES (1772900000000, 'AddIsActiveServiceCategory1772900000000');
INSERT INTO migrations (timestamp, name) VALUES (1774291540241, 'AddFieldCategoryService1774291540241');
INSERT INTO migrations (timestamp, name) VALUES (1772900000001, 'AddDescriptionServiceCategory1772900000001');
INSERT INTO migrations (timestamp, name) VALUES (1774555298181, 'AddServiceCategory1774555298181');
INSERT INTO migrations (timestamp, name) VALUES (1776038400000, 'AddSocialWorker1776038400000');
INSERT INTO migrations (timestamp, name) VALUES (1776124800000, 'AddClientFavoriteCompany1776124800000');
INSERT INTO migrations (timestamp, name) VALUES (1777000000000, 'AddDescriptionSession1777000000000');
INSERT INTO migrations (timestamp, name) VALUES (1777000000000, 'AllowNullableWorkerInSessionDetail1777000000000');
INSERT INTO migrations (timestamp, name) VALUES (1779000000000, 'ConvertSessionTablesToUtf8mb41779000000000');
INSERT INTO migrations (timestamp, name) VALUES (1780000000000, 'AddStatusLockedSession1780000000000');
INSERT INTO migrations (timestamp, name) VALUES (1780000000001, 'AddCancelReasonSessionDetail1780000000001');
INSERT INTO migrations (timestamp, name) VALUES (1780000000002, 'AddCancellationReasonSession1780000000002');
INSERT INTO migrations (timestamp, name) VALUES (1780000000003, 'AddCancelledBySession1780000000003');
INSERT INTO migrations (timestamp, name) VALUES (1780000000004, 'AddCompanyAliasesClient1780000000004');
INSERT INTO migrations (timestamp, name) VALUES (1779840000000, 'AddCompanyAddress1779840000000');
INSERT INTO migrations (timestamp, name) VALUES (1780000000005, 'DropLastNameWorker1780000000005');
INSERT INTO migrations (timestamp, name) VALUES (1780000000006, 'AddSessionIdWorkerFeedback1780000000006');
INSERT INTO migrations (timestamp, name) VALUES (1780000000007, 'AddSessionIdCompanyFeedback1780000000007');
INSERT INTO migrations (timestamp, name) VALUES (1780000000008, 'AddCompanyFirstAppointmentsClient1780000000008');
INSERT INTO migrations (timestamp, name) VALUES (1780000000009, 'CreateAppointmentBeforeAfter1780000000009');
INSERT INTO migrations (timestamp, name) VALUES (1780000000010, 'CreateNotifications1780000000010');
INSERT INTO migrations (timestamp, name) VALUES (1780000000011, 'AddAttemptsVerificationCodes1780000000011');
INSERT INTO migrations (timestamp, name) VALUES (1780000000011, 'CreateNotificationReminders1780000000011');
INSERT INTO migrations (timestamp, name) VALUES (1780000000012, 'AddAttendanceConfirmation1780000000012');
INSERT INTO migrations (timestamp, name) VALUES (1780000000013, 'CreateClientNotes1780000000013');
INSERT INTO migrations (timestamp, name) VALUES (1780000000014, 'CreateSiteCategories1780000000014');
INSERT INTO migrations (timestamp, name) VALUES (1780000000015, 'AddClientPreferences1780000000015');
INSERT INTO migrations (timestamp, name) VALUES (1780000000016, 'AddProviderGrowthPrompts1780000000016');
INSERT INTO migrations (timestamp, name) VALUES (1780000000017, 'AddServiceForCommunity1780000000017');
INSERT INTO migrations (timestamp, name) VALUES (1780000000018, 'CreateCompanyPortfolioPictures1780000000018');
INSERT INTO migrations (timestamp, name) VALUES (1780000000019, 'AddClientCreatedByCompanyWorker1780000000019');
INSERT INTO migrations (timestamp, name) VALUES (1780000000020, 'AddOriginalDatetimeToSessions1780000000020');
INSERT INTO migrations (timestamp, name) VALUES (1780000000021, 'NormalizeCompanyCalendarExceptions1780000000021');
INSERT INTO migrations (timestamp, name) VALUES (1780000000022, 'CreateSessionPayments1780000000022');
INSERT INTO migrations (timestamp, name) VALUES (1780000000023, 'CreatePayrollFoundation1780000000023');
INSERT INTO migrations (timestamp, name) VALUES (1780000000024, 'PayrollOneOpenPeriod1780000000024');
INSERT INTO migrations (timestamp, name) VALUES (1780000000025, 'AddSessionDetailCourtesy1780000000025');
INSERT INTO migrations (timestamp, name) VALUES (1780000000026, 'FeedbackStateAndDedup1780000000026');
INSERT INTO migrations (timestamp, name) VALUES (1780000000027, 'PayrollMultiCurrency1780000000027');
INSERT INTO migrations (timestamp, name) VALUES (1780000000028, 'PayrollConceptOccurredAt1780000000028');
INSERT INTO migrations (timestamp, name) VALUES (1780000000029, 'BackfillFrozenCurrencySnapshot1780000000029');
INSERT INTO migrations (timestamp, name) VALUES (1780000000030, 'SessionPaymentCollectedAt1780000000030');
INSERT INTO migrations (timestamp, name) VALUES (1780000000031, 'SessionPaymentWasPending1780000000031');
INSERT INTO migrations (timestamp, name) VALUES (1780000000032, 'SessionPaymentCompanyAdjustment1780000000032');
INSERT INTO migrations (timestamp, name) VALUES (1780000000033, 'PayrollConceptExchangeRate1780000000033');
INSERT INTO migrations (timestamp, name) VALUES (1780000000034, 'CompanyAllowPastAppointments1780000000034');
INSERT INTO migrations (timestamp, name) VALUES (1780000000035, 'AddProductCategory1780000000035');
INSERT INTO migrations (timestamp, name) VALUES (1780000000036, 'AddProductAndStock1780000000036');
INSERT INTO migrations (timestamp, name) VALUES (1780000000037, 'AddIsActiveToProducts1780000000037');
INSERT INTO migrations (timestamp, name) VALUES (1780000000038, 'AddSessionProduct1780000000038');
INSERT INTO migrations (timestamp, name) VALUES (1780000000039, 'PayrollConceptSourcePerWorker1780000000039');
INSERT INTO migrations (timestamp, name) VALUES (1780000000040, 'AddPaymentAttributions1780000000040');
INSERT INTO migrations (timestamp, name) VALUES (1780000000041, 'AddSessionPublicCode1780000000041');
INSERT INTO migrations (timestamp, name) VALUES (1780000000042, 'CreateOnboardingState1780000000042');
INSERT INTO migrations (timestamp, name) VALUES (1780000000043, 'CreateOnboardingRubroTemplates1780000000043');
INSERT INTO migrations (timestamp, name) VALUES (1780000000044, 'FixSpaMassageCategoryKey1780000000044');
INSERT INTO migrations (timestamp, name) VALUES (1780000000045, 'AddSourceTemplateKey1780000000045');
INSERT INTO migrations (timestamp, name) VALUES (1780000000046, 'CreateOnboardingRescueNotification1780000000046');
INSERT INTO migrations (timestamp, name) VALUES (1780000000047, 'ProductEconomicsAndWorkerPurchase1780000000047');
INSERT INTO migrations (timestamp, name) VALUES (1780000000048, 'DefaultAllowNegativeStockOff1780000000048');
INSERT INTO migrations (timestamp, name) VALUES (1780000000049, 'CreateDirectSale1780000000049');
INSERT INTO migrations (timestamp, name) VALUES (1780000000050, 'CreateCashTransaction1780000000050');
INSERT INTO migrations (timestamp, name) VALUES (1780000000051, 'CreateCashCategory1780000000051');
INSERT INTO migrations (timestamp, name) VALUES (1780000000052, 'AddCashTransactionSupplierKey1780000000052');
INSERT INTO migrations (timestamp, name) VALUES (1780000000053, 'CashSupplierKeyBinaryCollation1780000000053');
INSERT INTO migrations (timestamp, name) VALUES (1780000000054, 'CashTransactionIsRecurringBoolean1780000000054');
INSERT INTO migrations (timestamp, name) VALUES (1780000000055, 'CashTransactionMultiCurrency1780000000055');
INSERT INTO migrations (timestamp, name) VALUES (1780000000052, 'CreateStandingCommission1780000000052');
INSERT INTO migrations (timestamp, name) VALUES (1780000000053, 'AddCommissionRoles1780000000053');
INSERT INTO migrations (timestamp, name) VALUES (1780000000054, 'AddPaymentDiscounts1780000000054');
INSERT INTO migrations (timestamp, name) VALUES (1780000000056, 'CreateSubscriptionFoundation1780000000056');
INSERT INTO migrations (timestamp, name) VALUES (1780000000057, 'PaymentReportReportingFields1780000000057');
INSERT INTO migrations (timestamp, name) VALUES (1780000000058, 'PaymentReportRejectedFreesReference1780000000058');
INSERT INTO migrations (timestamp, name) VALUES (1780000000059, 'CreateSubscriptionEvent1780000000059');
INSERT INTO migrations (timestamp, name) VALUES (1780000000060, 'CreatePaymentReversal1780000000060');
INSERT INTO migrations (timestamp, name) VALUES (1780000000061, 'AddPaymentLineMethod1780000000061');
INSERT INTO migrations (timestamp, name) VALUES (1780000000062, 'AddPaymentCompanyCash1780000000062');
INSERT INTO migrations (timestamp, name) VALUES (1780000000063, 'PayrollConceptCurrencyUnique1780000000063');
INSERT INTO migrations (timestamp, name) VALUES (1780000000064, 'AddInactiveCompaniesToClient1780000000064');
INSERT INTO migrations (timestamp, name) VALUES (1780000000063, 'CobrixAutoVerification1780000000063');
INSERT INTO migrations (timestamp, name) VALUES (1780000000064, 'CompanyEmailRequired1780000000064');
INSERT INTO migrations (timestamp, name) VALUES (1780000000065, 'SubscriptionBillingExempt1780000000065');
INSERT INTO migrations (timestamp, name) VALUES (1780000000066, 'SubscriptionPlanIdNullable1780000000066');
INSERT INTO migrations (timestamp, name) VALUES (1780000000067, 'PaymentReportCoveredPeriod1780000000067');
INSERT INTO migrations (timestamp, name) VALUES (1780000000068, 'CreateImpersonationSession1780000000068');
INSERT INTO migrations (timestamp, name) VALUES (1780000000065, 'OnboardingConfigurePayrollStep1780000000065');
INSERT INTO migrations (timestamp, name) VALUES (1780000000069, 'CompanySlug1780000000069');
INSERT INTO migrations (timestamp, name) VALUES (1780000000070, 'CompanyWorkerSlug1780000000070');
INSERT INTO migrations (timestamp, name) VALUES (1780000000071, 'Identification1780000000071');
INSERT INTO migrations (timestamp, name) VALUES (1780000000072, 'WorkerClientUserOptional1780000000072');
INSERT INTO migrations (timestamp, name) VALUES (1780000000073, 'ClientCreatedAt1780000000073');
INSERT INTO migrations (timestamp, name) VALUES (1780000000074, 'CompanyWorkerPlanSuspended1780000000074');
INSERT INTO migrations (timestamp, name) VALUES (1780000000075, 'RescueNotificationPerChannel1780000000075');
INSERT INTO migrations (timestamp, name) VALUES (1780000000076, 'CreateCashClosing1780000000076');
INSERT INTO migrations (timestamp, name) VALUES (1780000000077, 'CreateWebHandoffTicket1780000000077');
INSERT INTO migrations (timestamp, name) VALUES (1780000000078, 'CompanyDeactivation1780000000078');
INSERT INTO migrations (timestamp, name) VALUES (1780000000079, 'PublicBookingModes1780000000079');
INSERT INTO migrations (timestamp, name) VALUES (1780000000080, 'PublicBookingIdentification1780000000080');
INSERT INTO migrations (timestamp, name) VALUES (1780000000081, 'OnboardingWizardStep1780000000081');
INSERT INTO migrations (timestamp, name) VALUES (1780000000082, 'OnboardingStartChoice1780000000082');
INSERT INTO migrations (timestamp, name) VALUES (1780000000083, 'PanelHiddenOwner1780000000083');
INSERT INTO migrations (timestamp, name) VALUES (1780000000084, 'PaymentOffers1780000000084');
INSERT INTO migrations (timestamp, name) VALUES (1780000000085, 'CampaignEmails1780000000085');
INSERT INTO migrations (timestamp, name) VALUES (1780000000086, 'ClientVisitFrequency1780000000086');
INSERT INTO migrations (timestamp, name) VALUES (1780000000087, 'PanelContactLog1780000000087');
INSERT INTO migrations (timestamp, name) VALUES (1780000000088, 'IdempotencyKeys1780000000088');
INSERT INTO migrations (timestamp, name) VALUES (1780000000089, 'IdempotencyResponseStatus1780000000089');
INSERT INTO migrations (timestamp, name) VALUES (1780000000090, 'CreatedOfflineAt1780000000090');
INSERT INTO migrations (timestamp, name) VALUES (1780000000091, 'CatalogSyncSince1780000000091');

SET FOREIGN_KEY_CHECKS = 1;
