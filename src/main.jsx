import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import CalendarPage from './CalendarPage.jsx'
import AiSettingsPage from './AiSettingsPage.jsx'
import CatalogPage from './CatalogPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/admin/ai-settings" element={<AiSettingsPage />} />
        <Route path="/admin/catalog" element={<CatalogPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
