import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VisitFrequencyReminderService } from '../session/visit-frequency-reminder.service';

function parseDate(args: string[]): Date {
  const arg = args.find((a) => a.startsWith('--date='));
  if (!arg) return new Date();
  const date = new Date(`${arg.slice('--date='.length)}T13:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Usa --date=AAAA-MM-DD');
  }
  return date;
}

async function main(): Promise<void> {
  const now = parseDate(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(VisitFrequencyReminderService).run(now);
    console.log(
      `Fecha simulada ${now.toISOString()}: ${result.clients} cliente(s) avisados, ${result.staff} persona(s) del negocio con resumen`,
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
