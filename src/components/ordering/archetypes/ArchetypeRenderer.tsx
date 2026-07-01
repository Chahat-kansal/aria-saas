import type { Archetype } from '@/lib/ordering/resolveArchetype'
import type { Theme } from '@/lib/menu/menu-theme'
import { FoodArchetype } from './FoodArchetype'
import { GenericArchetype } from './GenericArchetype'

interface Opt { id: string; name: string; priceCents: number; displayOrder: number | null }
interface Grp {
  id: string; name: string
  isRequired: boolean; minSelections: number; maxSelections: number
  archetypeSlot: string | null
  options: Opt[]
}

interface Props {
  resolvedArchetype: Archetype
  modifierGroups: Grp[]
  selectedMods: Record<string, string[]>
  onToggleMod: (grpId: string, modId: string, maxSel: number) => void
  theme: Theme
}

export function ArchetypeRenderer({ resolvedArchetype, modifierGroups, selectedMods, onToggleMod, theme }: Props) {
  switch (resolvedArchetype) {
    case 'food':
      return <FoodArchetype modifierGroups={modifierGroups} selectedMods={selectedMods} onToggleMod={onToggleMod} theme={theme} />
    default:
      return <GenericArchetype modifierGroups={modifierGroups} selectedMods={selectedMods} onToggleMod={onToggleMod} theme={theme} />
  }
}