/* oxlint-disable react/only-export-components -- This entry point mounts the app and loads route components lazily. */
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const ContentPage = lazy(() => import('./pages/ContentPage').then((module) => ({ default: module.ContentPage })));

const path = window.location.pathname;
try {
  const theme = localStorage.getItem('tiem_digital_theme');
  document.documentElement.classList.toggle('dark', theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
} catch {
  document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
}
const page = path === '/account' ? <AccountPage /> : path === '/admin' || path.startsWith('/admin/') ? <AdminPage /> : path.startsWith('/pages/') ? <ContentPage slug={path.slice(7)} /> : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p className="shop-empty" role="status">Đang tải…</p>}>{page}</Suspense>
  </StrictMode>,
)
