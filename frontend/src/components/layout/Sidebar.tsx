import { Badge, Box, NavLink, Stack, Text } from '@mantine/core'
import {
  IconActivityHeartbeat,
  IconLayoutDashboard,
  IconMoon,
  IconUrgent,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import { Link, useMatch } from 'react-router'
import { usePatientStats } from '../../api/hooks'
import type { PatientStatus } from '../../api/types'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectPatientList, statusChanged } from '../../store/patientListSlice'

interface StatusShortcut {
  status: PatientStatus | null
  label: string
  icon: Icon
}

const STATUS_SHORTCUTS: StatusShortcut[] = [
  { status: null, label: 'All patients', icon: IconUsers },
  { status: 'critical', label: 'Critical', icon: IconUrgent },
  { status: 'active', label: 'Active', icon: IconActivityHeartbeat },
  { status: 'inactive', label: 'Inactive', icon: IconMoon },
]

interface SidebarProps {
  /** Called when a link is followed, so the mobile drawer can close. */
  onNavigate: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const dispatch = useAppDispatch()
  const currentStatus = useAppSelector(selectPatientList).status
  const { data: stats } = usePatientStats()
  const onDashboard = useMatch({ path: '/', end: true }) !== null
  const onPatientList = useMatch({ path: '/patients', end: true }) !== null
  const onAnyPatientPage = useMatch({ path: '/patients', end: false }) !== null

  const countFor = (status: PatientStatus | null) =>
    status === null ? stats?.total : stats?.by_status[status]

  return (
    <Stack gap="lg">
      {/* On wide screens these two links live in the header instead. */}
      <Box component="nav" aria-label="Main" hiddenFrom="sm">
        <NavLink
          component={Link}
          to="/"
          label="Dashboard"
          leftSection={<IconLayoutDashboard size={18} />}
          active={onDashboard}
          onClick={onNavigate}
        />
        <NavLink
          component={Link}
          to="/patients"
          label="Patients"
          leftSection={<IconUsers size={18} />}
          active={onAnyPatientPage}
          onClick={onNavigate}
        />
      </Box>

      <Box component="nav" aria-label="Patients by status">
        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4} px="sm">
          Patients by status
        </Text>
        {STATUS_SHORTCUTS.map(({ status, label, icon: ShortcutIcon }) => (
          <NavLink
            key={label}
            component={Link}
            to="/patients"
            label={label}
            leftSection={<ShortcutIcon size={18} />}
            rightSection={
              <Badge variant="light" color="gray" size="sm">
                {countFor(status) ?? '…'}
              </Badge>
            }
            active={onPatientList && currentStatus === status}
            onClick={() => {
              dispatch(statusChanged(status))
              onNavigate()
            }}
          />
        ))}
      </Box>
    </Stack>
  )
}
