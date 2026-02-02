import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <App />
)

// Fade out loader
const loader = document.getElementById('loader');
if (loader) {
  loader.classList.add('fade');
  setTimeout(() => loader.remove(), 600);
}
