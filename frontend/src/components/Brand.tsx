import { Group, ThemeIcon, Title, UnstyledButton } from '@mantine/core'
import { IconStarFilled } from '@tabler/icons-react'
import { Link } from 'react-router'

export function Brand() {
  return (
    <UnstyledButton component={Link} to="/" aria-label="Lone Star Clinic home">
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon radius="xl" size="lg" aria-hidden>
          <IconStarFilled size={18} />
        </ThemeIcon>
        <Title order={1} size="h3" style={{ whiteSpace: 'nowrap' }}>
          Lone Star Clinic
        </Title>
      </Group>
    </UnstyledButton>
  )
}
