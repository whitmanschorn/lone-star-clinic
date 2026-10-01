import { ActionIcon, NavLink, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { IconMoon, IconSun } from '@tabler/icons-react'

/**
 * Switches between light and dark. Until the user chooses, the app follows the
 * operating system's setting; the choice is remembered in localStorage.
 */
function useColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme()
  const current = useComputedColorScheme('light', { getInitialValueInEffect: false })
  const next = current === 'dark' ? 'light' : 'dark'
  return {
    label: `Switch to ${next} mode`,
    Icon: next === 'dark' ? IconMoon : IconSun,
    toggle: () => setColorScheme(next),
  }
}

/** The compact button shown in the header. */
export function ColorSchemeToggle() {
  const { label, Icon, toggle } = useColorSchemeToggle()
  return (
    <ActionIcon variant="default" size="lg" aria-label={label} onClick={toggle}>
      <Icon size={18} />
    </ActionIcon>
  )
}

/** The same control as a row in the navigation drawer, for narrow screens. */
export function ColorSchemeNavItem() {
  const { label, Icon, toggle } = useColorSchemeToggle()
  return (
    <NavLink component="button" label={label} leftSection={<Icon size={18} />} onClick={toggle} />
  )
}
