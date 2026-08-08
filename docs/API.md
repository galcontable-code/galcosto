# Contrato de la API — Galcosto

Base: `/api`. Todo JSON. Autenticacion por `Authorization: Bearer <jwt>` salvo
donde se indique. Este documento es **la fuente de verdad** compartida entre el
backend y el frontend: si algo cambia, se cambia aca primero.

## Formato de errores

Toda respuesta de error usa esta forma:

```json
{
  "error": {
    "code": "ARCA_REJECTED",
    "message": "Mensaje legible en espanol para mostrar al usuario",
    "details": [{ "code": 10015, "msg": "..." }]
  }
}
```

Codigos: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` (409), `ARCA_REJECTED` (422),
`ARCA_UNAVAILABLE` (503), `INTERNAL` (500).

## Auth

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/auth/register` | Bootstrap: crea estudio + primer usuario ADMIN. Publico. `{ studioName, name, email, password }` -> `{ token, user, studio }` |
| POST | `/api/auth/login` | `{ email, password }` -> `{ token, user, studio }` |
| GET | `/api/auth/me` | -> `{ user, studio }` |

## Empresas (emisores)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/companies` | Lista las empresas del estudio |
| POST | `/api/companies` | Crea. `{ razonSocial, cuit, condicionIva, domicilio?, ... , environment, defaultPtoVta }` |
| GET | `/api/companies/:id` | Detalle (nunca devuelve cert ni key, solo metadatos) |

> El detalle y el listado de empresas incluyen `tieneCredenciales` (bool),
> `certSubject`, `certUploadedAt`, `certExpiresAt` y `certVencido` (bool).
> El `certPemEnc` y el `keyPemEnc` **nunca** salen de la API.

| PATCH | `/api/companies/:id` | Actualiza |
| DELETE | `/api/companies/:id` | Baja logica |
| POST | `/api/companies/:id/credentials` | Sube certificado + clave. `{ certPem, keyPem }` (texto PEM). Responde `{ certSubject, certExpiresAt }` |
| DELETE | `/api/companies/:id/credentials` | Borra las credenciales |
| POST | `/api/companies/:id/test-connection` | Prueba WSAA + WSFEv1 -> `{ ok, health, ta: { expirationTime } }` |
| GET | `/api/companies/:id/puntos-venta` | Puntos de venta habilitados en ARCA |
| GET | `/api/companies/:id/next-number?ptoVta=1&cbteTipo=11` | -> `{ ultimoAutorizado, proximo }` |

## Clientes

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/customers?search=&companyId=` | Lista con busqueda por razon social o documento |
| POST | `/api/customers` | Crea |
| GET | `/api/customers/:id` | Detalle |
| PATCH | `/api/customers/:id` | Actualiza |
| DELETE | `/api/customers/:id` | Baja logica |
| GET | `/api/padron/:cuit?companyId=` | Consulta el padron ARCA -> `ArcaPadronData`. 404 si no existe. |

## Productos / servicios

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/products?companyId=&search=` | Lista |
| POST | `/api/products` | Crea `{ companyId, descripcion, precioUnitario, ivaId, unidad?, codigo?, precioConIva? }` |
| PATCH | `/api/products/:id` | Actualiza |
| DELETE | `/api/products/:id` | Baja logica |

## Comprobantes

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | `/api/invoices/preview` | Calcula totales sin emitir. Mismo body que POST /invoices. -> `{ totals, proximoNumero, cbteTipoSugerido, validaciones: string[] }` |
| POST | `/api/invoices` | **Emite contra ARCA en tiempo real.** Devuelve el comprobante con CAE |
| GET | `/api/invoices?companyId=&estado=&desde=&hasta=&search=&page=&pageSize=` | Listado paginado -> `{ items, total, page, pageSize }` |
| GET | `/api/invoices/:id` | Detalle con items, tributos, cliente y datos ARCA |
| GET | `/api/invoices/:id/pdf` | PDF del comprobante con QR de ARCA (`application/pdf`) |
| POST | `/api/invoices/:id/credit-note` | Emite la nota de credito asociada. `{ motivo?, items? }` (si no manda items, replica el original) |
| POST | `/api/invoices/:id/retry` | Reintenta emitir un comprobante que quedo en BORRADOR o RECHAZADA |
| GET | `/api/invoices/:id/arca-log` | Request/response crudo con ARCA (auditoria) |

### Body de `POST /api/invoices`

```jsonc
{
  "companyId": "clx...",
  "ptoVta": 1,
  "cbteTipo": 11,              // opcional: si falta se sugiere segun condiciones IVA
  "concepto": 1,               // 1 Productos | 2 Servicios | 3 Ambos
  "customerId": "clx...",      // opcional si se mandan los datos sueltos
  "docTipo": 80,
  "docNro": "20111111112",
  "receptorRazonSocial": "ACME SA",
  "condicionIvaReceptorId": 1,
  "fechaCbte": "2026-08-07",   // ISO date
  "fchServDesde": "2026-08-01", // requerido si concepto 2 o 3
  "fchServHasta": "2026-08-31",
  "fchVtoPago": "2026-09-10",
  "monId": "PES",
  "monCotiz": 1,
  "items": [
    {
      "productId": null,
      "descripcion": "Honorarios profesionales",
      "cantidad": 1,
      "unidad": "unidad",
      "precioUnitario": 100000,
      "bonificacion": 0,
      "ivaId": 5,
      "precioConIva": false
    }
  ],
  "tributos": [
    { "tributoId": 2, "descripcion": "IIBB CABA", "baseImp": 100000, "alicuota": 3 }
  ],
  "observaciones": "Texto libre al pie"
}
```

### Respuesta de `POST /api/invoices`

```jsonc
{
  "id": "clx...",
  "estado": "EMITIDA",          // EMITIDA | RECHAZADA | BORRADOR | ANULADA
  "cae": "75123456789012",
  "caeVto": "2026-08-17",
  "cbteNro": 42,
  "numeroFormateado": "0001-00000042",
  "letra": "C",
  "descripcionComprobante": "Factura C",
  "impNeto": 100000, "impIVA": 0, "impTrib": 3000, "impTotal": 103000,
  "qrUrl": "https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjEs...",
  "pdfUrl": "/api/invoices/clx.../pdf",
  "observaciones": [{ "code": 10015, "msg": "..." }],
  "items": [ /* ... */ ],
  "company": { /* ... */ },
  "customer": { /* ... */ }
}
```

Si ARCA rechaza, la respuesta es **422** con `code: "ARCA_REJECTED"` y el
comprobante queda guardado en estado `RECHAZADA` con los errores, para poder
corregir y reintentar.

## Catalogos

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/catalogs` | Todos los catalogos de una: `{ tiposComprobante, tiposDocumento, alicuotasIva, condicionesIvaReceptor, conceptos, monedas, tiposTributo, unidades }`. Publico (no requiere token). |

## Dashboard

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/dashboard?companyId=&periodo=mes` | `{ emitidas, totalFacturado, ivaLiquidado, promedio, ultimasFacturas, serieDiaria, porTipo, estadoArca }` |

## Salud

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/api/health` | `{ ok, version, demoMode, uptime }`. Publico. |
| GET | `/api/arca/status?environment=HOMO` | Estado de los servidores ARCA (FEDummy). Publico. |
