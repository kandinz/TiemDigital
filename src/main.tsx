import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AccountPage } from './pages/AccountPage'
import { AdminPage } from './pages/AdminPage'
import { ContentPage } from './pages/ContentPage'

const path = window.location.pathname;
const page = path === '/account' ? <AccountPage /> : path === '/admin' || path.startsWith('/admin/') ? <AdminPage /> : path.startsWith('/pages/') ? <ContentPage slug={path.slice(7)} /> : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
