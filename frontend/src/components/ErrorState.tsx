import { Alert, Button, Stack, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { describeError } from '../lib/errors'

interface ErrorStateProps {
  title: string
  error: unknown
  onRetry?: () => void
}

export function ErrorState({ title, error, onRetry }: ErrorStateProps) {
  return (
    <Alert color="red" title={title} icon={<IconAlertTriangle />}>
      <Stack align="flex-start" gap="sm">
        <Text size="sm">{describeError(error)}</Text>
        {onRetry && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Stack>
    </Alert>
  )
}
