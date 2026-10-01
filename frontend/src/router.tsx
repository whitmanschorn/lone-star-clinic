import { createBrowserRouter } from 'react-router'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PatientDetailPage } from './pages/PatientDetailPage'
import { PatientEditPage } from './pages/PatientEditPage'
import { PatientNewPage } from './pages/PatientNewPage'
import { PatientsPage } from './pages/PatientsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'patients', element: <PatientsPage /> },
      { path: 'patients/new', element: <PatientNewPage /> },
      { path: 'patients/:patientId', element: <PatientDetailPage /> },
      { path: 'patients/:patientId/edit', element: <PatientEditPage /> },
      // Unknown URLs keep the header and sidebar, so there is a way back.
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
