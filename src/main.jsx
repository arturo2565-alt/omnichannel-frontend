import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import CalendarPage from './CalendarPage.jsx'
import CrmPage from './CrmPage.jsx'
import DashboardView from './DashboardView.jsx'
import AiSettingsPage from './AiSettingsPage.jsx'
import CatalogAdminPage from './CatalogAdminPage.jsx'
import CalibrationPage from './CalibrationPage.jsx'
import LoginPage from './LoginPage.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { ThemeProvider } from './ThemeContext.jsx'

const SupervisionPreviewPage = import.meta.env.DEV
  ? lazy(() => import('./supervision/SupervisionPreviewPage.jsx'))
  : null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {import.meta.env.DEV && SupervisionPreviewPage ? (
            <Route
              path="/dev/supervision"
              element={
                <Suspense fallback={null}>
                  <SupervisionPreviewPage />
                </Suspense>
              }
            />
          ) : null}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <App />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm"
            element={
              <ProtectedRoute>
                <CrmPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/ai-settings"
            element={
              <ProtectedRoute>
                <AiSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/catalog"
            element={
              <ProtectedRoute>
                <CatalogAdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/calibracion"
            element={
              <ProtectedRoute>
                <CalibrationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lab"
            element={
              <ProtectedRoute>
                <Navigate to="/" replace />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
