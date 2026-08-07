/**
 * Configuracion de una empresa emisora: datos fiscales, credenciales de ARCA
 * (certificado + clave privada) y prueba de conexion.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Company, CompanyInput, PuntoVenta, TestConnectionResult } from '../lib/types';
import { api, mensajeDeError } from '../lib/api';
import { useCompany } from '../lib/company';
import { useToast } from '../lib/toast';
import { useTitulo } from '../lib/hooks';
import { Modal } from '../components/Modal';
import {
  Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Skeleton,
  Table, Td, Th, Tr,
} from '../components/ui';
import { IconCertificado, IconEnchufe, IconFlechaIzq } from '../components/Icons';
import { formatCuit, formatDate, formatDateTime, soloDigitos, validarCuit } from '../lib/format';

export function EmpresaDetallePage(): JSX.Element {
  const { id = '' } = useParams();
  const { recargar } = useCompany();
  const toast = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyInput | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<TestConnectionResult | null>(null);
  const [puntos, setPuntos] = useState<PuntoVenta[] | null>(null);
  const [confirmarProd, setConfirmarProd] = useState(false);

  useTitulo(company?.razonSocial ?? 'Empresa');

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    api
      .company(id)
      .then((c) => {
        setCompany(c);
        setForm({
          razonSocial: c.razonSocial, cuit: c.cuit, nombreFantasia: c.nombreFantasia ?? '',
          condicionIva: c.condicionIva, domicilio: c.domicilio ?? '', localidad: c.localidad ?? '',
          provincia: c.provincia ?? '', ingresosBrutos: c.ingresosBrutos ?? '',
          environment: c.environment, defaultPtoVta: c.defaultPtoVta,
        });
        setError(null);
      })
      .catch((e: unknown) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(cargar, [cargar]);

  async function guardarDatos(): Promise<void> {
    if (!form) return;
    const cuitLimpio = soloDigitos(form.cuit);
    if (!validarCuit(cuitLimpio)) {
      toast.error('CUIT invalido', 'Revisá el digito verificador.');
      return;
    }
    setGuardando(true);
    try {
      const c = await api.updateCompany(id, { ...form, cuit: cuitLimpio });
      setCompany(c);
      await recargar();
      toast.exito('Datos guardados');
    } catch (e) {
      toast.error('No se pudo guardar', mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function subirCredenciales(): Promise<void> {
    if (!certPem.trim() || !keyPem.trim()) {
      toast.error('Faltan datos', 'Pegá el certificado y la clave privada en formato PEM.');
      return;
    }
    setSubiendo(true);
    try {
      const r = await api.uploadCredentials(id, { certPem: certPem.trim(), keyPem: keyPem.trim() });
      toast.exito('Certificado cargado', r.certSubject);
      setCertPem('');
      setKeyPem('');
      cargar();
      await recargar();
    } catch (e) {
      toast.error('No se pudo cargar el certificado', mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  }

  async function borrarCredenciales(): Promise<void> {
    try {
      await api.deleteCredentials(id);
      toast.exito('Credenciales borradas');
      cargar();
      await recargar();
    } catch (e) {
      toast.error('No se pudieron borrar', mensajeDeError(e));
    }
  }

  async function probar(): Promise<void> {
    setProbando(true);
    setResultado(null);
    try {
      const r = await api.testConnection(id);
      setResultado(r);
      if (r.ok) toast.exito('Conexion con ARCA establecida');
      else toast.error('ARCA no respondio como esperabamos', r.message);
    } catch (e) {
      toast.error('Fallo la prueba de conexion', mensajeDeError(e));
      setResultado({ ok: false, message: mensajeDeError(e) });
    } finally {
      setProbando(false);
    }
  }

  async function traerPuntosVenta(): Promise<void> {
    try {
      setPuntos(await api.puntosVenta(id));
    } catch (e) {
      toast.error('No pudimos traer los puntos de venta', mensajeDeError(e));
    }
  }

  function cambiarEntorno(env: 'HOMO' | 'PROD'): void {
    if (env === 'PROD') { setConfirmarProd(true); return; }
    setForm((f) => (f ? { ...f, environment: env } : f));
  }

  if (cargando) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (error || !company || !form) {
    return (
      <Alert tono="rojo" titulo="No pudimos abrir la empresa"
        acciones={<Link to="/empresas"><Button tamano="sm">Volver</Button></Link>}>
        {error ?? 'La empresa no existe.'}
      </Alert>
    );
  }

  return (
    <div>
      <Link to="/empresas" className="mb-1 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <IconFlechaIzq className="h-4 w-4" /> Empresas
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">{company.razonSocial}</h1>
        <Badge tono={company.environment === 'PROD' ? 'verde' : 'ambar'}>
          {company.environment === 'PROD' ? 'Produccion' : 'Homologacion'}
        </Badge>
        <span className="tabular text-sm text-slate-500">{formatCuit(company.cuit)}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Datos fiscales */}
        <Card>
          <CardHeader titulo="Datos fiscales"
            descripcion="Salen impresos en el comprobante: tienen que coincidir con ARCA." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Razon social" className="sm:col-span-2">
              <Input value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })} />
            </Field>
            <Field label="CUIT">
              <Input value={form.cuit} className="tabular" onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
            </Field>
            <Field label="Condicion IVA">
              <Select value={form.condicionIva}
                onChange={(e) => setForm({ ...form, condicionIva: e.target.value as CompanyInput['condicionIva'] })}>
                <option value="RI">Responsable Inscripto</option>
                <option value="MONOTRIBUTO">Monotributista</option>
                <option value="EXENTO">Exento</option>
              </Select>
            </Field>
            <Field label="Domicilio" className="sm:col-span-2">
              <Input value={form.domicilio ?? ''} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
            </Field>
            <Field label="Ingresos brutos">
              <Input value={form.ingresosBrutos ?? ''} onChange={(e) => setForm({ ...form, ingresosBrutos: e.target.value })} />
            </Field>
            <Field label="Punto de venta por defecto">
              <Input type="number" min={1} alineado="der" value={form.defaultPtoVta}
                onChange={(e) => setForm({ ...form, defaultPtoVta: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="Entorno" className="sm:col-span-2">
              <Select value={form.environment} onChange={(e) => cambiarEntorno(e.target.value as 'HOMO' | 'PROD')}>
                <option value="HOMO">Homologacion (pruebas)</option>
                <option value="PROD">Produccion (comprobantes reales)</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <Button onClick={() => void guardarDatos()} cargando={guardando}>Guardar cambios</Button>
          </div>
        </Card>

        {/* Credenciales ARCA */}
        <Card>
          <CardHeader titulo="Credenciales de ARCA"
            descripcion="El certificado y la clave privada con los que la app se autentica ante los web services." />

          {company.hasCredentials ? (
            <Alert tono="verde" titulo="Certificado cargado" className="mb-4">
              <dl className="space-y-0.5 text-sm">
                {company.certSubject ? <div><span className="font-medium">Titular:</span> {company.certSubject}</div> : null}
                {company.certExpiresAt ? <div><span className="font-medium">Vence:</span> {formatDate(company.certExpiresAt)}</div> : null}
                {company.certUploadedAt ? <div><span className="font-medium">Cargado:</span> {formatDateTime(company.certUploadedAt)}</div> : null}
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button tamano="sm" onClick={() => void probar()} cargando={probando}
                  iconoIzq={<IconEnchufe className="h-4 w-4" />}>
                  Probar conexion
                </Button>
                <Button tamano="sm" variante="secundario" onClick={() => void traerPuntosVenta()}>
                  Ver puntos de venta
                </Button>
                <Button tamano="sm" variante="fantasma" onClick={() => void borrarCredenciales()}>
                  Borrar credenciales
                </Button>
              </div>
            </Alert>
          ) : (
            <Alert tono="ambar" titulo="Todavia no cargaste el certificado" className="mb-4">
              Sin certificado la app solo puede facturar en modo demo, con CAE simulado.
            </Alert>
          )}

          <details className="mb-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
              Como obtener el certificado en ARCA
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
              <li>
                Generá la clave y el pedido de certificado:
                <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{`openssl genrsa -out empresa.key 2048
openssl req -new -key empresa.key \\
  -subj "/C=AR/O=${company.razonSocial}/CN=galcosto/serialNumber=CUIT ${company.cuit}" \\
  -out empresa.csr`}</pre>
              </li>
              <li>En ARCA, con clave fiscal nivel 3, entrá a <strong>Administracion de Certificados Digitales</strong>, subí el <code>.csr</code> y descargá el <code>.crt</code>.</li>
              <li>En <strong>Administrador de Relaciones de Clave Fiscal</strong> → Nueva Relacion, asociá el servicio <strong>Facturacion Electronica (wsfe)</strong> al certificado.</li>
              <li>Para homologacion el tramite equivalente se hace en <strong>WSASS</strong>.</li>
              <li>Pegá abajo el contenido de los dos archivos.</li>
            </ol>
          </details>

          <div className="space-y-3">
            <Field label="Certificado (.crt / .pem)">
              <textarea rows={4} value={certPem} onChange={(e) => setCertPem(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900" />
            </Field>
            <Field label="Clave privada (.key)" hint="Se guarda cifrada con AES-256-GCM y nunca vuelve a salir de la API.">
              <textarea rows={4} value={keyPem} onChange={(e) => setKeyPem(e.target.value)}
                placeholder="-----BEGIN RSA PRIVATE KEY-----"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900" />
            </Field>
            <Button onClick={() => void subirCredenciales()} cargando={subiendo}
              iconoIzq={<IconCertificado className="h-4 w-4" />}>
              Cargar credenciales
            </Button>
          </div>

          {resultado ? (
            <Alert tono={resultado.ok ? 'verde' : 'rojo'} className="mt-4"
              titulo={resultado.ok ? 'ARCA respondio correctamente' : 'La conexion fallo'}>
              {resultado.health ? (
                <p className="tabular">
                  AppServer {resultado.health.appServer} · DbServer {resultado.health.dbServer} · AuthServer {resultado.health.authServer}
                </p>
              ) : null}
              {resultado.ta ? <p>Ticket de acceso valido hasta {formatDateTime(resultado.ta.expirationTime)}</p> : null}
              {resultado.message ? <p>{resultado.message}</p> : null}
            </Alert>
          ) : null}

          {puntos ? (
            <div className="mt-4">
              <p className="lbl mb-1">Puntos de venta habilitados</p>
              {puntos.length === 0 ? (
                <p className="text-sm text-slate-500">ARCA no devolvio puntos de venta para este CUIT.</p>
              ) : (
                <Table>
                  <thead><tr><Th>Numero</Th><Th>Tipo</Th><Th>Estado</Th></tr></thead>
                  <tbody>
                    {puntos.map((p) => (
                      <Tr key={p.Nro}>
                        <Td className="tabular">{String(p.Nro).padStart(4, '0')}</Td>
                        <Td>{p.EmisionTipo}</Td>
                        <Td>{p.Bloqueado ? <Badge tono="rojo">Bloqueado</Badge> : <Badge tono="verde">Activo</Badge>}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <Modal abierto={confirmarProd} onClose={() => setConfirmarProd(false)}
        titulo="Pasar a produccion"
        descripcion="A partir de este cambio los comprobantes que emitas son fiscalmente validos."
        footer={
          <>
            <Button variante="secundario" onClick={() => setConfirmarProd(false)}>Cancelar</Button>
            <Button variante="peligro" onClick={() => {
              setForm({ ...form, environment: 'PROD' });
              setConfirmarProd(false);
            }}>
              Entiendo, pasar a produccion
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>La numeracion avanza de verdad y no se puede retroceder.</li>
          <li>Necesitás el certificado de produccion, que es distinto al de homologacion.</li>
          <li>Los errores se corrigen con notas de credito, no borrando comprobantes.</li>
          <li>Probá antes en homologacion cada tipo de comprobante que vayas a usar.</li>
        </ul>
      </Modal>
    </div>
  );
}
