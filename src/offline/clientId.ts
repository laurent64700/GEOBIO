// crypto.randomUUID() is available in every secure context this app runs in
// (HTTPS/localhost — same requirement the PWA itself already has). Generating
// the id client-side (instead of relying on Postgres's `default
// gen_random_uuid()`) means an offline-created record already has its final,
// real id from the moment of creation — no id-remapping needed once synced
// (spec §4.1).
export function generateClientId(): string {
  return crypto.randomUUID()
}
