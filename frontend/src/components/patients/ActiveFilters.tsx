import { Anchor, Button, Group, Text } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { formatDate } from '../../lib/format'
import {
  activeFilterGroups,
  type AdvancedFilters,
  type FilterGroup,
} from '../../store/patientListSlice'

/** One applied filter in words, e.g. "Age 40–60" or "Condition: diabetes". */
function describe(group: FilterGroup, filters: AdvancedFilters): string {
  switch (group) {
    case 'age': {
      const { min_age: min, max_age: max } = filters
      if (min !== null && max !== null) return min === max ? `Age ${min}` : `Age ${min}–${max}`
      return min !== null ? `Age ${min} and over` : `Age ${max} and under`
    }
    case 'last_visit': {
      const { last_visit_from: from, last_visit_to: to } = filters
      if (from && to) return `Last visit ${formatDate(from)} – ${formatDate(to)}`
      return from ? `Last visit from ${formatDate(from)}` : `Last visit up to ${formatDate(to)}`
    }
    case 'blood_type':
      return `Blood type ${filters.blood_type.join(', ')}`
    case 'condition':
      return `Condition: ${filters.condition}`
    case 'medication':
      return `Medication: ${filters.medication}`
    case 'allergy':
      return `Allergy: ${filters.allergy}`
    case 'city':
      return `City: ${filters.city}`
  }
}

interface ActiveFiltersProps {
  filters: AdvancedFilters
  onRemove: (group: FilterGroup) => void
  onClearAll: () => void
}

/** The applied advanced filters as removable chips, so it is clear why rows are missing. */
export function ActiveFilters({ filters, onRemove, onClearAll }: ActiveFiltersProps) {
  const groups = activeFilterGroups(filters)
  if (groups.length === 0) return null

  return (
    <Group gap="xs" role="group" aria-label="Active filters">
      <Text size="sm" c="dimmed">
        Filtered by:
      </Text>
      {groups.map((group) => {
        const label = describe(group, filters)
        return (
          // The whole chip is the remove button, which keeps it a comfortable
          // touch target and reachable by keyboard.
          <Button
            key={group}
            variant="light"
            size="compact-sm"
            radius="xl"
            fw={500}
            rightSection={<IconX size={14} aria-hidden />}
            aria-label={`Remove filter: ${label}`}
            onClick={() => onRemove(group)}
          >
            {label}
          </Button>
        )
      })}
      {groups.length > 1 && (
        <Anchor component="button" type="button" size="sm" onClick={onClearAll}>
          Clear all filters
        </Anchor>
      )}
    </Group>
  )
}
