/**
 * Listado y alta de empresas emisoras del estudio.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CompanyInput, CondicionIvaEmisor } from '../lib/types';
import { api, mensajeDeError } from '../lib/api';
import { useCompany } from '../lib/company';
import { useToast } from '../lib/toast';
import { useTitulo } from '../lib/hooks';
import { Modal } from '../components/Modal';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader,
  Select, Skeleton, Table, Td, Th, Tr,
} from '../components/ui';
import { IconCertificado, IconEmpresas, IconMas } from '../components/Icons';
import { formatCuit, soloDigitos, validarCuit } from '../lib/format';

const VACIO: CompanyInput = {
  razonSocial: '', cuit: '', condicionIva: 'RI', domicilio: '', localidad: '',
  provincia: '', ingresosBrutos: '', environment: 'HOMO', defaultPtoVta: 1,
};

const CONDICIONES: Array<{ id: CondicionIvaEmisor; desc: string; nota: string }> = [
  { id: 'RI', desc: 'Responsable Inscripto', nota: 'Emite A o B segun el receptor' },
  { id: 'MONOTRIBUTO', desc: 'Monotributista', nota: 'Emite siempre factura C' },
  { id: 'EXENTO', desc: 'Exento', nota: 'Emite siempre factura C' },
];

export function EmpresasPage(): JSX.Element {
  useTitulo('Empresas');
  const { companies, cargando, error, recargar, seleccionar } = useCompany();
  const toast = useToast();
  const navigate = useNavigate();

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<CompanyInput>(VACIO);
  const [guardando, setGuardando] = useState(false);

  const cuitLimpio = soloDigitos(form.cuit);
  const cuitInvalido = cuitLimpio.length > 0 && !validarCuit(cuitLimpio);

  async function guardar(): Promise<void> {
    if (!form.razonSocial.trim()) { toast.error('Falta la razon social'); return; }
    if (!validarCuit(cuitLimpio)) {
      toast.error('CUIT invalido', 'Revisá el digito verificador.');
      return;
    }
    setGuardando(true);
    try {
      const creada = await api.createCompany({ ...form, cuit: cuitLimpio });
      toast.exito('Empresa creada', 'Ahora cargale el certificado de ARCA para poder facturar.');
      setAbierto(false);
      setForm(VACIO);
      await recargar();
      seleccionar(creada.id);
      navigate(`/empresas/${creada.id}`);
    } catch (e) {
      toast.error('No se pudo crear la empresa', mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <PageHeader titulo="Empresas"
        descripcion="Los contribuyentes por los que factura el estudio."
        acciones={
          <Button onClick={() => { setForm(VACIO); setAbierto(true); }} iconoIzq={<IconMas className="h-4 w-4" />}>
            Nueva empresa
          </Button>
        } />

      {error ? (
        <Alert tono="rojo" titulo="No pudimos cargar las empresas" className="mb-4"
          acciones={<Button tamano="sm" onClick={() => void recargar()}>Reintentar</Button>}>{error}</Alert>
      ) : null}

      <Card padding={false}>
        {cargando && companies.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : companies.length === 0 ? (
          <EmptyState className="py-12" icono={<IconEmpresas className="h-6 w-6" />}
            titulo="Todavia no hay empresas"
            descripcion="Cargá el primer contribuyente para empezar a facturar."
            accion={<Button onClick={() => setAbierto(true)}>Crear la primera</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Razon social</Th>
                <Th>CUIT</Th>
                <Th>Condicion IVA</Th>
                <Th>Entorno</Th>
                <Th>Certificado</Th>
                <Th align="right"><span className="sr-only">Acciones</span></Th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <Tr key={c.id} onClick={() => navigate(`/empresas/${c.id}`)}>
                  <Td>
                    <span className="block font-medium text-slate-900 dark:text-white">{c.razonSocial}</span>
                    {c.nombreFantasia ? (
                      <span className="block text-xs text-slate-500">{c.nombreFantasia}</span>
                    ) : null}
                  </Td>
                  <Td className="tabular">{formatCuit(c.cuit)}</Td>
                  <Td className="text-slate-500">
                    {CONDICIONES.find((x) => x.id === c.condicionIva)?.desc ?? c.condicionIva}
                  </Td>
                  <Td>
                    <Badge tono={c.environment === 'PROD' ? 'verde' : 'ambar'}>
                      {c.environment === 'PROD' ? 'Produccion' : 'Homologacion'}
                    </Badge>
                  </Td>
                  <Td>
                    {c.tieneCredenciales ? (
                      <Badge tono="verde" punto>Cargado</Badge>
                    ) : (
                      <Badge tono="gris" punto>Sin cargar</Badge>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                      <IconCertificado className="h-4 w-4" /> Configurar
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal abierto={abierto} onClose={() => setAbierto(false)} ancho="lg" titulo="Nueva empresa emisora"
        descripcion="Los datos fiscales salen impresos en el comprobante, asi que tienen que coincidir con los de ARCA."
        footer={
          <>
            <Button variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={() => void guardar()} cargando={guardando}>Crear empresa</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Razon social" requerido className="sm:col-span-2">
            <Input value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} />
          </Field>
          <Field label="Nombre de fantasia">
            <Input value={form.nombreFantasia ?? ''} onChange={(e) => setForm((f) => ({ ...f, nombreFantasia: e.target.value }))} />
          </Field>
          <Field label="CUIT" requerido error={cuitInvalido ? 'El digito verificador no cierra' : undefined}>
            <Input value={form.cuit} invalido={cuitInvalido} className="tabular"
              onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))} placeholder="30-12345678-9" />
          </Field>
          <Field label="Condicion frente al IVA" className="sm:col-span-2"
            hint={CONDICIONES.find((c) => c.id === form.condicionIva)?.nota}>
            <Select value={form.condicionIva}
              onChange={(e) => setForm((f) => ({ ...f, condicionIva: e.target.value as CondicionIvaEmisor }))}>
              {CONDICIONES.map((c) => <option key={c.id} value={c.id}>{c.desc}</option>)}
            </Select>
          </Field>
          <Field label="Domicilio comercial" className="sm:col-span-2">
            <Input value={form.domicilio ?? ''} onChange={(e) => setForm((f) => ({ ...f, domicilio: e.target.value }))} />
          </Field>
          <Field label="Localidad">
            <Input value={form.localidad ?? ''} onChange={(e) => setForm((f) => ({ ...f, localidad: e.target.value }))} />
          </Field>
          <Field label="Provincia">
            <Input value={form.provincia ?? ''} onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} />
          </Field>
          <Field label="Ingresos brutos">
            <Input value={form.ingresosBrutos ?? ''} onChange={(e) => setForm((f) => ({ ...f, ingresosBrutos: e.target.value }))}
              placeholder="901-234567-8 o Exento" />
          </Field>
          <Field label="Punto de venta por defecto">
            <Input type="number" min={1} value={form.defaultPtoVta} alineado="der"
              onChange={(e) => setForm((f) => ({ ...f, defaultPtoVta: Number(e.target.value) || 1 }))} />
          </Field>
          <Field label="Entorno" className="sm:col-span-2"
            hint="Empezá siempre en homologacion: los comprobantes no tienen validez fiscal y podes probar tranquilo.">
            <Select value={form.environment}
              onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value as 'HOMO' | 'PROD' }))}>
              <option value="HOMO">Homologacion (pruebas)</option>
              <option value="PROD">Produccion (comprobantes reales)</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
