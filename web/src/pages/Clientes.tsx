/**
 * ABM de clientes, con alta rapida a partir del padron de ARCA.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Customer, CustomerInput } from '../lib/types';
import { api, comoLista, mensajeDeError } from '../lib/api';
import { useCatalogs } from '../lib/catalogs';
import { useCompany } from '../lib/company';
import { useToast } from '../lib/toast';
import { useDebounced, useTitulo } from '../lib/hooks';
import { Modal } from '../components/Modal';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader,
  Select, Skeleton, Table, Td, Th, Tr,
} from '../components/ui';
import { IconBorrar, IconBuscar, IconClientes, IconEditar, IconMas } from '../components/Icons';
import { formatCuit, soloDigitos, validarCuit, validarDocumento } from '../lib/format';

const VACIO: CustomerInput = {
  razonSocial: '', docTipo: 80, docNro: '', condicionIvaReceptorId: 1,
  email: '', telefono: '', domicilio: '', localidad: '', provincia: '',
};

export function ClientesPage(): JSX.Element {
  useTitulo('Clientes');
  const { companyId } = useCompany();
  const { tiposDocumento, condicionesIvaReceptor, descCondicionIva, descTipoDoc } = useCatalogs();
  const toast = useToast();

  const [busqueda, setBusqueda] = useState('');
  const search = useDebounced(busqueda, 350);
  const [lista, setLista] = useState<Customer[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [buscandoPadron, setBuscandoPadron] = useState(false);
  const [aBorrar, setABorrar] = useState<Customer | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    api
      .customers({ search: search || undefined })
      .then((r) => { setLista(comoLista(r)); setError(null); })
      .catch((e: unknown) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false));
  }, [search]);

  useEffect(cargar, [cargar]);

  function abrirNuevo(): void {
    setEditando(null);
    setForm(VACIO);
    setAbierto(true);
  }

  function abrirEditar(c: Customer): void {
    setEditando(c);
    setForm({
      razonSocial: c.razonSocial, docTipo: c.docTipo, docNro: c.docNro,
      condicionIvaReceptorId: c.condicionIvaReceptorId, email: c.email ?? '',
      telefono: c.telefono ?? '', domicilio: c.domicilio ?? '',
      localidad: c.localidad ?? '', provincia: c.provincia ?? '',
    });
    setAbierto(true);
  }

  const errorDoc = validarDocumento(form.docTipo, form.docNro);

  async function traerDelPadron(): Promise<void> {
    const cuit = soloDigitos(form.docNro);
    if (!validarCuit(cuit)) {
      toast.error('CUIT invalido', 'Revisá el digito verificador antes de consultar el padron.');
      return;
    }
    setBuscandoPadron(true);
    try {
      const p = await api.padron(cuit, companyId ?? undefined);
      setForm((f) => ({
        ...f,
        razonSocial: p.razonSocial || f.razonSocial,
        condicionIvaReceptorId: p.condicionIvaReceptorId || f.condicionIvaReceptorId,
        domicilio: p.domicilio ?? f.domicilio,
        localidad: p.localidad ?? f.localidad,
        provincia: p.provincia ?? f.provincia,
      }));
      toast.exito('Datos traidos de ARCA', p.razonSocial);
    } catch (e) {
      toast.error('No pudimos consultar el padron', mensajeDeError(e));
    } finally {
      setBuscandoPadron(false);
    }
  }

  async function guardar(): Promise<void> {
    if (!form.razonSocial.trim()) {
      toast.error('Falta la razon social');
      return;
    }
    if (errorDoc) {
      toast.error('Documento invalido', errorDoc);
      return;
    }
    setGuardando(true);
    try {
      const body: CustomerInput = { ...form, docNro: soloDigitos(form.docNro) || form.docNro };
      if (editando) {
        await api.updateCustomer(editando.id, body);
        toast.exito('Cliente actualizado');
      } else {
        await api.createCustomer(body);
        toast.exito('Cliente creado');
      }
      setAbierto(false);
      cargar();
    } catch (e) {
      toast.error('No se pudo guardar', mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(): Promise<void> {
    if (!aBorrar) return;
    try {
      await api.deleteCustomer(aBorrar.id);
      toast.exito('Cliente dado de baja');
      setABorrar(null);
      cargar();
    } catch (e) {
      toast.error('No se pudo dar de baja', mensajeDeError(e));
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        descripcion={lista.length > 0 ? `${lista.length} cliente${lista.length === 1 ? '' : 's'}` : undefined}
        acciones={<Button onClick={abrirNuevo} iconoIzq={<IconMas className="h-4 w-4" />}>Nuevo cliente</Button>}
      />

      <Card className="mb-4">
        <div className="relative">
          <IconBuscar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por razon social o documento" className="pl-8" />
        </div>
      </Card>

      {error ? (
        <Alert tono="rojo" titulo="No pudimos cargar los clientes" className="mb-4"
          acciones={<Button tamano="sm" onClick={cargar}>Reintentar</Button>}>{error}</Alert>
      ) : null}

      <Card padding={false}>
        {cargando && lista.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : lista.length === 0 ? (
          <EmptyState className="py-12" icono={<IconClientes className="h-6 w-6" />}
            titulo={search ? 'Ningun cliente coincide' : 'Todavia no cargaste clientes'}
            descripcion={search ? 'Probá con otro texto.' : 'Podés cargarlos a mano o traerlos del padron por CUIT.'}
            accion={<Button onClick={abrirNuevo}>Cargar el primero</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Razon social</Th>
                <Th>Documento</Th>
                <Th>Condicion IVA</Th>
                <Th>Contacto</Th>
                <Th align="right"><span className="sr-only">Acciones</span></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-slate-900 dark:text-white">{c.razonSocial}</Td>
                  <Td>
                    <span className="tabular block">
                      {c.docTipo === 80 ? formatCuit(c.docNro) : c.docNro}
                    </span>
                    <span className="block text-xs text-slate-500">{descTipoDoc(c.docTipo)}</span>
                  </Td>
                  <Td><Badge tono="gris">{descCondicionIva(c.condicionIvaReceptorId)}</Badge></Td>
                  <Td className="text-slate-500">{c.email || c.telefono || '—'}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <button type="button" title="Editar" onClick={() => abrirEditar(c)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                        <IconEditar className="h-4 w-4" />
                      </button>
                      <button type="button" title="Dar de baja" onClick={() => setABorrar(c)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                        <IconBorrar className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal abierto={abierto} onClose={() => setAbierto(false)} ancho="lg"
        titulo={editando ? 'Editar cliente' : 'Nuevo cliente'}
        footer={
          <>
            <Button variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={() => void guardar()} cargando={guardando}>Guardar</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de documento">
            <Select value={form.docTipo} onChange={(e) => setForm((f) => ({ ...f, docTipo: Number(e.target.value) }))}>
              {tiposDocumento.map((t) => <option key={t.id} value={t.id}>{t.desc}</option>)}
            </Select>
          </Field>
          <Field label="Numero" requerido error={form.docNro ? errorDoc ?? undefined : undefined}>
            <div className="flex gap-2">
              <Input value={form.docNro} invalido={Boolean(form.docNro && errorDoc)}
                onChange={(e) => setForm((f) => ({ ...f, docNro: e.target.value }))}
                placeholder="30-12345678-9" className="tabular" />
              {form.docTipo === 80 ? (
                <Button variante="secundario" onClick={() => void traerDelPadron()}
                  cargando={buscandoPadron} className="shrink-0">
                  Traer de ARCA
                </Button>
              ) : null}
            </div>
          </Field>
          <Field label="Razon social" requerido className="sm:col-span-2">
            <Input value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} />
          </Field>
          <Field label="Condicion frente al IVA" className="sm:col-span-2">
            <Select value={form.condicionIvaReceptorId}
              onChange={(e) => setForm((f) => ({ ...f, condicionIvaReceptorId: Number(e.target.value) }))}>
              {condicionesIvaReceptor.map((c) => <option key={c.id} value={c.id}>{c.desc}</option>)}
            </Select>
          </Field>
          <Field label="Domicilio" className="sm:col-span-2">
            <Input value={form.domicilio ?? ''} onChange={(e) => setForm((f) => ({ ...f, domicilio: e.target.value }))} />
          </Field>
          <Field label="Localidad">
            <Input value={form.localidad ?? ''} onChange={(e) => setForm((f) => ({ ...f, localidad: e.target.value }))} />
          </Field>
          <Field label="Provincia">
            <Input value={form.provincia ?? ''} onChange={(e) => setForm((f) => ({ ...f, provincia: e.target.value }))} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Telefono">
            <Input value={form.telefono ?? ''} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      <Modal abierto={Boolean(aBorrar)} onClose={() => setABorrar(null)} titulo="Dar de baja el cliente"
        descripcion={`${aBorrar?.razonSocial ?? ''} deja de aparecer al facturar. Los comprobantes ya emitidos no se tocan.`}
        footer={
          <>
            <Button variante="secundario" onClick={() => setABorrar(null)}>Cancelar</Button>
            <Button variante="peligro" onClick={() => void borrar()}>Dar de baja</Button>
          </>
        }
      >
        <p className="text-sm text-slate-500">Esta accion se puede revertir volviendo a crear el cliente.</p>
      </Modal>
    </div>
  );
}
