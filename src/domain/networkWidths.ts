// Real physical band width (meters) per confirmed telluric network — from
// Laurent's manual, same source table as networkBearings.ts. Purely a
// rendering constant (not persisted anywhere), mirroring how
// networkColors.ts/networkBearings.ts already resolve per-network facts in
// code rather than a DB column.
const NETWORK_WIDTH_M: Record<string, number> = {
  Hartmann: 0.21,
  Curry: 0.4,
  Palm: 0.36,
  Peyré: 0.4,
  Wissmann: 0.5,
}

const FALLBACK_WIDTH_M = 0.21

export function widthForNetwork(networkName: string): number {
  return NETWORK_WIDTH_M[networkName] ?? FALLBACK_WIDTH_M
}
