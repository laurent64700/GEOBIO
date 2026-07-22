// Angle family per confirmed telluric network (spec §2/§5, source: the same
// table already seeded in supabase/migrations/0005_seed_confirmed_networks.sql
// — Wissmann's 45° is explicitly unconfirmed there, assumed = Curry). Used to
// constrain which guide-line bearing presets are offered while a given
// network is armed for felt-point placement (spec §5) — NOT to auto-set the
// bearing; Laurent still places the anchor and picks among the allowed
// presets himself.
const NETWORK_BEARING_FAMILY: Record<string, [number, number]> = {
  Hartmann: [0, 90],
  Palm: [0, 90],
  Peyré: [0, 90],
  Curry: [45, 135],
  Wissmann: [45, 135],
}

export function allowedBearingsForNetwork(networkName: string | null): [number, number] | null {
  if (networkName === null) return null
  return NETWORK_BEARING_FAMILY[networkName] ?? null
}
