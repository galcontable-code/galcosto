/**
 * Datos del estudio y del usuario, estado del sistema y aviso de modo demo.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArcaHealth, HealthPayload } from '../lib/types';
import { api, mensajeDeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/company';
import { useTheme } from '../lib/theme';
import { useTitulo } from '../lib/hooks';
import { Alert, Badge, Button, Card, CardHeader, PageHeader, Skeleton, Toggle } from '../components/ui';
import { IconLuna, IconSol } from '../components/Icons';
import { formatCuit } from '../lib/format';

export function ConfiguracionPage(): JSX.Element {
  useTitulo('Configuracion');
  const { user, studio, logout } = useAuth();
  const { companies } = useCompany();
  const { theme, toggle } = useTheme();
  const oscuro = theme === 'dark';

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [arca, setArca] = useState<ArcaHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e: unknown) => setError(mensajeDeError(e)));
    api.arcaStatus('HOMO').then(setArca).catch(() => setArca(null));
  }, []);

  const sinCertificado = companies.filter((c) => !c.tieneCredenciales);

  return (
    <div>
      <PageHeader titulo="Configuracion" />

      {health?.demoMode ? (
        <Alert tono="ambar" titulo="La app esta corriendo en modo demo" className="mb-4">
          <p>
            Los comprobantes se emiten contra un simulador: el CAE es inventado y
            <strong> no tienen validez fiscal</strong>. Sirve para probar el circuito completo
            sin certificados.
          </p>
          <p className="mt-2">
            Para facturar de verdad, poné <code>ARCA_DEMO_MODE=false</code> en el archivo
            <code> .env</code> y cargá el certificado de cada empresa en{' '}
            <Link to="/empresas" className="font-medium text-blue-600 underline dark:text-blue-400">Empresas</Link>.
          </p>
        </Alert>
      ) : null}

      {!health?.demoMode && sinCertificado.length > 0 ? (
        <Alert tono="ambar" titulo="Hay empresas sin certificado" className="mb-4">
          {sinCertificado.map((c) => c.razonSocial).join(', ')} no van a poder facturar hasta que
          cargues sus credenciales de ARCA.
        </Alert>
      ) : null}

      {error ? <Alert tono="rojo" titulo="No pudimos consultar el estado" className="mb-4">{error}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader titulo="Estudio" />
          <dl className="space-y-2 text-sm">
            <Dato t="Nombre" v={studio?.name ?? '—'} />
            <Dato t="CUIT" v={studio?.cuit ? formatCuit(studio.cuit) : '—'} />
            <Dato t="Empresas" v={String(companies.length)} />
          </dl>
        </Card>

        <Card>
          <CardHeader titulo="Tu usuario" />
          <dl className="space-y-2 text-sm">
            <Dato t="Nombre" v={user?.name ?? '—'} />
            <Dato t="Email" v={user?.email ?? '—'} />
            <Dato t="Rol" v={user?.role ?? '—'} />
          </dl>
          <div className="mt-4">
            <Button variante="secundario" onClick={logout}>Cerrar sesion</Button>
          </div>
        </Card>

        <Card>
          <CardHeader titulo="Apariencia" />
          <Toggle checked={oscuro} onChange={toggle} label="Modo oscuro"
            descripcion="Se guarda en este navegador." />
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            {oscuro ? <IconLuna className="h-4 w-4" /> : <IconSol className="h-4 w-4" />}
            Tema {oscuro ? 'oscuro' : 'claro'}
          </p>
        </Card>

        <Card>
          <CardHeader titulo="Estado del sistema" />
          {!health ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <dl className="space-y-2 text-sm">
              <Dato t="Version" v={health.version} />
              <Dato t="Entorno" v={health.env ?? '—'} />
              <div className="flex items-center gap-2">
                <dt className="font-medium text-slate-500">API:</dt>
                <dd><Badge tono={health.ok ? 'verde' : 'rojo'} punto>{health.ok ? 'En linea' : 'Con problemas'}</Badge></dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="font-medium text-slate-500">ARCA:</dt>
                <dd>
                  {arca ? (
                    <Badge tono={arca.ok ? 'verde' : 'rojo'} punto>
                      {arca.ok ? 'Respondiendo' : 'Sin respuesta'}
                    </Badge>
                  ) : (
                    <Badge tono="gris">Sin datos</Badge>
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="font-medium text-slate-500">Modo:</dt>
                <dd>
                  <Badge tono={health.demoMode ? 'ambar' : 'verde'}>
                    {health.demoMode ? 'Demo (CAE simulado)' : 'Real (conecta con ARCA)'}
                  </Badge>
                </dd>
              </div>
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }): JSX.Element {
  return (
    <div className="flex gap-1.5">
      <dt className="font-medium text-slate-500">{t}:</dt>
      <dd className="min-w-0 truncate text-slate-800 dark:text-slate-200">{v}</dd>
    </div>
  );
}
