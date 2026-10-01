import { AppShell, Burger, Button, Group } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import { Link, Outlet, useMatch } from 'react-router'
import { ApiStatus } from '../ApiStatus'
import { Brand } from '../Brand'
import { PatientModals } from '../patients/PatientModals'
import { Sidebar } from './Sidebar'

function HeaderLink({ to, end, label }: { to: string; end?: boolean; label: string }) {
  const active = useMatch({ path: to, end: end ?? false }) !== null
  return (
    <Button
      component={Link}
      to={to}
      variant={active ? 'light' : 'subtle'}
      size="compact-md"
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Button>
  )
}

/** Header, sidebar and main area shared by every page. */
export function AppLayout() {
  // Below the `sm` breakpoint the sidebar is a drawer opened by the burger.
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false)

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap" gap="sm">
            <Burger
              opened={navOpened}
              onClick={toggleNav}
              hiddenFrom="sm"
              size="sm"
              aria-label={navOpened ? 'Close navigation' : 'Open navigation'}
            />
            <Brand />
          </Group>
          <Group component="nav" aria-label="Main" gap="xs" visibleFrom="sm" wrap="nowrap">
            <HeaderLink to="/" end label="Dashboard" />
            <HeaderLink to="/patients" label="Patients" />
          </Group>
          <ApiStatus />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Sidebar onNavigate={closeNav} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <PatientModals />
      {/* Rendered inside the router so a notification can link to a page. */}
      <Notifications />
    </AppShell>
  )
}
