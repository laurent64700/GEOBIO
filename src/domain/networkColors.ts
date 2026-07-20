import type { GridInstance, GridTemplate } from './types'

/**
 * Colors for networks that have no GridTemplate because they aren't
 * theoretical-grid networks (freeform categories). A plain code-owned
 * constant, not a database table — see spec §2 step 3. Confirmed with
 * Laurent: cyan for Eau (distinct from Palm's steel blue #4a90c4), brown for
 * Failles (distinct from every other network/layer color in the app).
 */
export const NON_GRID_NETWORK_COLORS: Record<string, string> = {
  Eau: '#00acc1',
  Failles: '#795548',
}

const FALLBACK_COLOR = '#888888'

/**
 * 4-step resolution chain (spec §2): active GridInstance on this plan wins
 * (lets a per-mission override take effect if one is ever introduced), else
 * the network's GridTemplate (covers Hartmann/Curry/Palm/Peyré/Wissmann even
 * with no grid generated on this plan), else the free-standing table above
 * (non-grid categories), else grey.
 */
export function resolveNetworkColor(
  networkName: string,
  instances: GridInstance[],
  templates: GridTemplate[]
): string {
  const instanceMatch = instances.find((i) => i.templateSnapshot.name === networkName)
  if (instanceMatch) return instanceMatch.templateSnapshot.color

  const templateMatch = templates.find((t) => t.name === networkName)
  if (templateMatch) return templateMatch.color

  if (Object.hasOwn(NON_GRID_NETWORK_COLORS, networkName)) return NON_GRID_NETWORK_COLORS[networkName]

  return FALLBACK_COLOR
}
