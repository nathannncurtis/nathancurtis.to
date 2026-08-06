import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Fade in once the display face is in. document.fonts.ready waits on every
// weight of all five families — a whole second of held-back paint to dodge one
// swap — so ask for the one face the first screen sets in large type, and cap
// the wait at 350ms. The bare setTimeout is unconditional: the page can never
// stay hidden.
const reveal = () => document.getElementById('root')?.classList.add('ready')
const revealNextFrame = () => requestAnimationFrame(reveal)
document.fonts.load('1em Cormorant').then(revealNextFrame, revealNextFrame)
setTimeout(reveal, 350)
