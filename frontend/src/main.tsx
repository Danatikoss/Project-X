import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, type Theme } from './store/theme'

// Apply saved theme before first render to avoid flash
const saved = localStorage.getItem('slidex-theme')
const initialTheme: Theme = (saved ? (JSON.parse(saved).state?.theme ?? 'light') : 'light') as Theme
applyTheme(initialTheme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
