import { Group, ThemeIcon, Title } from '@mantine/core'
import { IconStarFilled } from '@tabler/icons-react'

export function Brand() {
  return (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon radius="xl" size="lg" aria-hidden>
        <IconStarFilled size={18} />
      </ThemeIcon>
      <Title order={1} size="h3" style={{ whiteSpace: 'nowrap' }}>
        Lone Star Clinic
      </Title>
    </Group>
  )
}
