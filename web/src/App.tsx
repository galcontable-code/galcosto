import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { RequireAuth, useAuth } from './lib/auth';
import { LoginPage } from './pages/Login';
import { RegistroPage } from './pages/Registro';
import { DashboardPage } from './pages/Dashboard';
import { FacturarPage } from './pages/facturar/FacturarPage';
import { ComprobantesPage } from './pages/Comprobantes';
import { ComprobanteDetallePage } from './pages/ComprobanteDetalle';
import { ClientesPage } from './pages/Clientes';
import { ProductosPage } from './pages/Productos';
import { EmpresasPage } from './pages/Empresas';
import { EmpresaDetallePage } from './pages/EmpresaDetalle';
import { ConfiguracionPage } from './pages/Configuracion';
import { Button, EmptyState } from './components/ui';
import { Link } from 'react-router-dom';

/** Si ya hay sesión, /login y /registro redirigen al panel. */
function SoloInvitados({ children }: { children: JSX.Element }): JSX.Element {
  const { autenticado, cargando } = useAuth();
  if (cargando) return <></>;
  if (autenticado) return <Navigate to="/" replace />;
  return children;
}

function NoEncontrada(): JSX.Element {
  return (
    <EmptyState
      titulo="No encontramos esta pantalla"
      descripcion="La dirección que abriste no existe o cambió de lugar."
      accion={
        <Link to="/">
          <Button>Volver al inicio</Button>
        </Link>
      }
    />
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <SoloInvitados>
            <LoginPage />
          </SoloInvitados>
        }
      />
      <Route
        path="/registro"
        element={
          <SoloInvitados>
            <RegistroPage />
          </SoloInvitados>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/facturar" element={<FacturarPage />} />
        <Route path="/comprobantes" element={<ComprobantesPage />} />
        <Route path="/comprobantes/:id" element={<ComprobanteDetallePage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/productos" element={<ProductosPage />} />
        <Route path="/empresas" element={<EmpresasPage />} />
        <Route path="/empresas/:id" element={<EmpresaDetallePage />} />
        <Route path="/configuracion" element={<ConfiguracionPage />} />
        <Route path="*" element={<NoEncontrada />} />
      </Route>
    </Routes>
  );
}
