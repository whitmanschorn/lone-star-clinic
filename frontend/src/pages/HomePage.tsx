import { Card, Container, Stack, Text } from '@mantine/core'
import { ApiStatus } from '../components/ApiStatus'
import { Brand } from '../components/Brand'

export function HomePage() {
  return (
    <Container size="xs" py="xl">
      <Card withBorder padding="xl">
        <Stack align="flex-start">
          <Brand />
          <Text c="dimmed">Patient management for a small-town practice with a big-sky view.</Text>
          <ApiStatus />
        </Stack>
      </Card>
    </Container>
  )
}
