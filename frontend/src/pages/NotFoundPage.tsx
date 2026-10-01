import { Button, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <Stack align="flex-start">
      <Title order={2}>This trail has gone cold</Title>
      <Text c="dimmed">We could not find the page you were looking for.</Text>
      <Button component={Link} to="/">
        Back to the dashboard
      </Button>
    </Stack>
  )
}
