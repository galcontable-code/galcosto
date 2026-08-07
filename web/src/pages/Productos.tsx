/**
 * ABM de productos y servicios. Sirven para armar comprobantes mas rapido:
 * el asistente los autocompleta por descripcion.
 */

import { useCallback, useEffect, useState } from 'react';
import type { Product, ProductInput } from '../lib/types';
import { api, comoLista, mensajeDeError } from '../lib/api';
import { useCatalogs } from '../lib/catalogs';
import { useCompany } from '../lib/company';
import { useToast } from '../lib/toast';
import { useDebounced, useTitulo } from '../lib/hooks';
import { Modal } from '../components/Modal';
import {
  Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader,
  Select, Skeleton, Table, Td, Th, Toggle, Tr,
} from '../components/ui';
import { IconBorrar, IconBuscar, IconEditar, IconMas, IconProductos } from '../components/Icons';
import { formatMoney, parseImporte } from '../lib/format';

const UNIDADES = ['unidad', 'hora', 'mes', 'dia', 'kg', 'litro', 'metro', 'cupo', 'legajo', 'jornada'];

export function ProductosPage(): JSX.Element {
  useTitulo('Productos y servicios');
  const { companyId, company } = useCompany();
  const { alicuotasIva, descAlicuota } = useCatalogs();
  const toast = useToast();

  const [busqueda, setBusqueda] = useState('');
  const search = useDebounced(busqueda, 350);
  const [lista, setLista] = useState<Product[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductInput>({
    companyId: '', descripcion: '', unidad: 'unidad', precioUnitario: 0, ivaId: 5, precioConIva: false,
  });
  const [precioTexto, setPrecioTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<Product | null>(null);

  const cargar = useCallback(() => {
    if (!companyId) { setLista([]); setCargando(false); return; }
    setCargando(true);
    api
      .products({ companyId, search: search || undefined })
      .then((r) => { setLista(comoLista(r)); setError(null); })
      .catch((e: unknown) => setError(mensajeDeError(e)))
      .finally(() => setCargando(false));
  }, [companyId, search]);

  useEffect(cargar, [cargar]);

  function abrirNuevo(): void {
    if (!companyId) return;
    setEditando(null);
    setForm({ companyId, descripcion: '', unidad: 'unidad', precioUnitario: 0, ivaId: 5, precioConIva: false });
    setPrecioTexto('');
    setAbierto(true);
  }

  function abrirEditar(p: Product): void {
    setEditando(p);
    setForm({
      companyId: p.companyId, codigo: p.codigo ?? '', descripcion: p.descripcion,
      unidad: p.unidad, precioUnitario: p.precioUnitario, ivaId: p.ivaId, precioConIva: p.precioConIva,
    });
    setPrecioTexto(String(p.precioUnitario));
    setAbierto(true);
  }

  async function guardar(): Promise<void> {
    const precio = parseImporte(precioTexto);
    if (!form.descripcion.trim()) { toast.error('Falta la descripcion'); return; }
    if (!(precio > 0)) { toast.error('El precio tiene que ser mayor a cero'); return; }

    setGuardando(true);
    try {
      const body: ProductInput = { ...form, precioUnitario: precio };
      if (editando) {
        await api.updateProduct(editando.id, body);
        toast.exito('Actualizado');
      } else {
        await api.createProduct(body);
        toast.exito('Creado');
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
      await api.deleteProduct(aBorrar.id);
      toast.exito('Dado de baja');
      setABorrar(null);
      cargar();
    } catch (e) {
      toast.error('No se pudo dar de baja', mensajeDeError(e));
    }
  }

  if (!companyId) {
    return (
      <EmptyState titulo="Elegi una empresa emisora"
        descripcion="Los productos y servicios se cargan por empresa."
        icono={<IconProductos className="h-6 w-6" />} />
    );
  }

  return (
    <div>
      <PageHeader titulo="Productos y servicios"
        descripcion={company ? `De ${company.razonSocial}` : undefined}
        acciones={<Button onClick={abrirNuevo} iconoIzq={<IconMas className="h-4 w-4" />}>Nuevo</Button>} />

      <Card className="mb-4">
        <div className="relative">
          <IconBuscar className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por descripcion o codigo" className="pl-8" />
        </div>
      </Card>

      {error ? (
        <Alert tono="rojo" titulo="No pudimos cargar el listado" className="mb-4"
          acciones={<Button tamano="sm" onClick={cargar}>Reintentar</Button>}>{error}</Alert>
      ) : null}

      <Card padding={false}>
        {cargando && lista.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : lista.length === 0 ? (
          <EmptyState className="py-12" icono={<IconProductos className="h-6 w-6" />}
            titulo={search ? 'Nada coincide con la busqueda' : 'Todavia no cargaste productos'}
            descripcion="Cargalos una vez y despues los elegis al facturar escribiendo las primeras letras."
            accion={<Button onClick={abrirNuevo}>Cargar el primero</Button>} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Codigo</Th>
                <Th>Descripcion</Th>
                <Th>Unidad</Th>
                <Th align="right">Precio</Th>
                <Th>IVA</Th>
                <Th align="right"><span className="sr-only">Acciones</span></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <Tr key={p.id}>
                  <Td className="tabular text-slate-500">{p.codigo || '—'}</Td>
                  <Td className="font-medium text-slate-900 dark:text-white">{p.descripcion}</Td>
                  <Td className="text-slate-500">{p.unidad}</Td>
                  <Td align="right" className="tabular font-semibold">
                    {formatMoney(p.precioUnitario)}
                    {p.precioConIva ? <span className="block text-xs font-normal text-slate-400">IVA incluido</span> : null}
                  </Td>
                  <Td><Badge tono="gris">{descAlicuota(p.ivaId)}</Badge></Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <button type="button" title="Editar" onClick={() => abrirEditar(p)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                        <IconEditar className="h-4 w-4" />
                      </button>
                      <button type="button" title="Dar de baja" onClick={() => setABorrar(p)}
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

      <Modal abierto={abierto} onClose={() => setAbierto(false)}
        titulo={editando ? 'Editar' : 'Nuevo producto o servicio'}
        footer={
          <>
            <Button variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={() => void guardar()} cargando={guardando}>Guardar</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Codigo">
            <Input value={form.codigo ?? ''} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              placeholder="Opcional" />
          </Field>
          <Field label="Unidad">
            <Select value={form.unidad} onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Descripcion" requerido className="sm:col-span-2">
            <Input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
          </Field>
          <Field label="Precio unitario" requerido>
            <Input value={precioTexto} onChange={(e) => setPrecioTexto(e.target.value)}
              inputMode="decimal" alineado="der" placeholder="0,00" />
          </Field>
          <Field label="Alicuota de IVA">
            <Select value={form.ivaId} onChange={(e) => setForm((f) => ({ ...f, ivaId: Number(e.target.value) }))}>
              {alicuotasIva.map((a) => <option key={a.id} value={a.id}>{a.desc}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Toggle checked={Boolean(form.precioConIva)}
              onChange={(v) => setForm((f) => ({ ...f, precioConIva: v }))}
              label="El precio ya incluye IVA"
              descripcion="Si esta activo, al facturar se desagrega el neto automaticamente." />
          </div>
        </div>
      </Modal>

      <Modal abierto={Boolean(aBorrar)} onClose={() => setABorrar(null)} titulo="Dar de baja"
        descripcion={`${aBorrar?.descripcion ?? ''} deja de aparecer al facturar.`}
        footer={
          <>
            <Button variante="secundario" onClick={() => setABorrar(null)}>Cancelar</Button>
            <Button variante="peligro" onClick={() => void borrar()}>Dar de baja</Button>
          </>
        }
      >
        <p className="text-sm text-slate-500">Los comprobantes ya emitidos no se modifican.</p>
      </Modal>
    </div>
  );
}
