import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Wait for fonts + a tick for layout to settle, then fade in
document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    document.getElementById('root')!.classList.add('ready')
  })
})
