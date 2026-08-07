import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { CompanyProvider } from './lib/company';
import { CatalogsProvider } from './lib/catalogs';
import { ToastProvider } from './lib/toast';
import { ThemeProvider } from './lib/theme';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el nodo #root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <CatalogsProvider>
            <AuthProvider>
              <CompanyProvider>
                <App />
              </CompanyProvider>
            </AuthProvider>
          </CatalogsProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
