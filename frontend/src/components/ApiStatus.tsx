import { Badge } from '@mantine/core'
import { useHealth } from '../api/hooks'

/** Shows whether the backend is reachable, via GET /health. */
export function ApiStatus() {
  const { data, error, isLoading } = useHealth()

  if (isLoading) {
    return (
      <Badge variant="light" color="gray">
        Checking API…
      </Badge>
    )
  }
  if (error || data?.status !== 'ok') {
    return (
      <Badge variant="light" color="red">
        API unreachable
      </Badge>
    )
  }
  return (
    <Badge variant="light" color="teal">
      API online
    </Badge>
  )
}
