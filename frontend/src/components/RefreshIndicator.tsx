import { Group, Loader, Text } from '@mantine/core'
import { useLingering } from '../lib/useLingering'

/**
 * Says that what is on screen may be stale and a fresh copy is on its way:
 * the visible half of stale-while-revalidate. Pass SWR's `isValidating`
 * (while there is already data to show).
 */
export function RefreshIndicator({ active }: { active: boolean }) {
  const visible = useLingering(active)
  if (!visible) return null
  return (
    <Group gap={6} wrap="nowrap" role="status" aria-live="polite">
      <Loader size={12} />
      <Text size="xs" c="dimmed">
        Updating…
      </Text>
    </Group>
  )
}
