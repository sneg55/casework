import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles.css'

const root =
  document.getElementById('root') ?? document.body.appendChild(document.createElement('div'))

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
