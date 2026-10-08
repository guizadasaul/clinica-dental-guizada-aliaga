// Cada suite e2e levanta su propia app y corren en paralelo sobre la misma
// base: el barrido de consultas web (CLI-257) de una tocaría los datos de
// otra. Apagado para todas; el e2e que lo prueba llama a sync() a mano.
process.env['WEB_CONSULTATION_SYNC_INTERVAL_MS'] = '0';
