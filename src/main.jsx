import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/rubik/400.css'
import '@fontsource/rubik/500.css'
import '@fontsource/rubik/600.css'
import '@fontsource/rubik/700.css'
import '@fontsource/pacifico'
import './index.css'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { LocaleProvider } from './context/LocaleContext'
import { SettingsProvider } from './context/SettingsContext'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { GalleryProvider } from './context/GalleryContext'
import { GalleryDataProvider } from './context/GalleryDataContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <SettingsProvider>
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
                <GalleryProvider>
                  <GalleryDataProvider>
                    <App />
                  </GalleryDataProvider>
                </GalleryProvider>
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </SettingsProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
