import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { DB, STATE_FILE, type ItState } from './helpers/env';

/** Apaga la app de prueba y borra el MySQL desechable (IT_KEEP_DB=1 lo deja). */
export default function globalTeardown(): void {
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as ItState;
    try {
      process.kill(state.serverPid);
    } catch {
      /* ya terminó */
    }
    fs.rmSync(STATE_FILE, { force: true });
  }
  if (process.env.IT_KEEP_DB !== '1') {
    try {
      execFileSync('docker', ['rm', '-f', DB.container], { stdio: 'pipe' });
    } catch {
      /* no estaba */
    }
  }
}
