import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initializeEntraAuth } from '@/lib/entraAuth'

const renderApp = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
}

initializeEntraAuth()
  .catch((error) => {
    console.warn('Microsoft Entra startup skipped or failed', error)
  })
  .finally(() => {
    renderApp()
  })
