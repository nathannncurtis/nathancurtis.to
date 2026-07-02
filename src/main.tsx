import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Fade in once fonts settle — with a hard fallback so the page never stays hidden
const reveal = () => document.getElementById('root')?.classList.add('ready')
document.fonts.ready.then(() => requestAnimationFrame(reveal))
setTimeout(reveal, 1200)
