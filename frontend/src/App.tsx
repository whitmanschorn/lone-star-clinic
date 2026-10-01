import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { Provider as ReduxProvider } from 'react-redux'
import { RouterProvider } from 'react-router'
import { SWRConfig } from 'swr'
import { router } from './router'
import { store } from './store'
import { theme } from './theme'

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <ReduxProvider store={store}>
        {/* Refetching every time the tab regains focus is noisy for a dashboard. */}
        <SWRConfig value={{ revalidateOnFocus: false }}>
          <RouterProvider router={router} />
        </SWRConfig>
      </ReduxProvider>
    </MantineProvider>
  )
}
