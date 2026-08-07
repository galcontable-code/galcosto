# Galcosto — Facturación electrónica ARCA en tiempo real

App de facturación electrónica para **estudios contables**: conecta con los web
services de ARCA (ex AFIP), y en tres pasos emite el comprobante y devuelve el
**CAE en el momento**.

Pensada para un estudio que factura por muchos CUITs: cada empresa cliente
tiene sus propias credenciales, su numeración y sus puntos de venta, y se
cambia de una a otra desde el selector de arriba.

---

## Qué hace

- **Asistente de 3 pasos** — cliente → ítems → confirmar. Emite y muestra el CAE.
- **Conexión real con ARCA** — WSAA (autenticación con certificado) + WSFEv1
  (`FECAESolicitar`). El ticket de acceso se cachea las 12 horas que dura, como
  exige ARCA.
- **Padrón** — escribís el CUIT y trae razón social, domicilio y condición
  frente al IVA.
- **Tipo de comprobante sugerido** — según la condición IVA del emisor y la del
  receptor (RI → RI da A, RI → consumidor final da B, monotributista siempre C).
- **PDF con QR** — el comprobante impreso con el QR obligatorio de ARCA, CAE y
  vencimiento.
- **Notas de crédito y débito** — con el comprobante asociado bien referenciado.
- **Multi-empresa y multi-usuario** — todo aislado por estudio.
- **Modo demo** — la app funciona de punta a punta sin certificados, con CAEs
  simulados. Ideal para probarla antes de conectar ARCA de verdad.

## Puesta en marcha

Requiere Node.js 20 o superior.

```bash
git clone <este-repo> && cd galcosto
cp .env.example .env
npm run setup     # instala, crea la base y carga datos de ejemplo
npm run dev       # API en :4000, front en :5173
```

Abrí <http://localhost:5173> y entrá con:

```
usuario:    demo@galcosto.app
contraseña: Demo1234!
```

Arranca en **modo demo** (`ARCA_DEMO_MODE=true`): podés recorrer todo el
circuito, emitir comprobantes y ver los PDF sin tener certificados. Los CAE son
simulados y los comprobantes **no tienen validez fiscal**.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API + frontend en modo desarrollo |
| `npm run build` | Compila backend y frontend |
| `npm start` | Producción: un solo proceso sirve la API y el frontend |
| `npm test` | Corre los tests |
| `npm run typecheck` | Chequeo de tipos |
| `npm run seed` | Recarga los datos de ejemplo |
| `npm run db:studio` | Explorador de la base (Prisma Studio) |

## Conectar con ARCA de verdad

El modo demo alcanza para evaluar la app. Para emitir comprobantes reales:

### 1. Generar la clave privada y el pedido de certificado

```bash
openssl genrsa -out estudio.key 2048
openssl req -new -key estudio.key -subj "/C=AR/O=<RAZON SOCIAL>/CN=galcosto/serialNumber=CUIT <TU CUIT>" -out estudio.csr
```

### 2. Obtener el certificado en ARCA

En el portal de ARCA, con clave fiscal nivel 3:

1. **Administración de Certificados Digitales** → subí el `.csr` y descargá el
   `.crt` que te devuelve.
2. **Administrador de Relaciones de Clave Fiscal** → *Nueva Relación* → buscá el
   servicio **Facturación Electrónica (wsfe)** y asociá el certificado (el
   alias que le pusiste). Repetí para **ws_sr_padron_a5** si querés el lookup
   de CUIT.

Para probar contra el ambiente de homologación, el trámite equivalente se hace
en **WSASS** (`wsass-homo.afip.gob.ar`).

### 3. Cargarlo en la app

**Empresas → (elegir la empresa) → Credenciales ARCA**: pegá el contenido del
`.crt` y del `.key`, y tocá **Probar conexión**. Si responde OK, ya podés
facturar.

Los certificados se guardan **cifrados con AES-256-GCM**; la clave sale de
`APP_ENCRYPTION_KEY`.

### 4. Pasar a producción

```bash
# .env
ARCA_DEMO_MODE=false
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
JWT_SECRET=<algo largo y aleatorio>
NODE_ENV=production
```

Y en la empresa, cambiá el entorno de **Homologación** a **Producción**. Ojo:
desde ese momento los comprobantes son fiscalmente válidos y la numeración
avanza de verdad.

## Cómo está armado

```
server/
  prisma/schema.prisma      modelo de datos
  src/
    domain/                 reglas de negocio puras, sin dependencias
      catalogs.ts           catálogos ARCA y reglas de tipo de comprobante
      totals.ts             cálculo de importes (en centavos enteros)
      arca-port.ts          interfaz ArcaClient
    arca/                   integración con ARCA
      wsaa.ts               autenticación + cache del ticket
      wsfev1.ts             SOAP de facturación
      padron.ts             consulta de contribuyentes
      client.ts             implementación real
      demo-client.ts        implementación simulada
    services/               casos de uso (emisión, PDF, dashboard)
    routes/                 endpoints HTTP
web/
  src/pages/                pantallas
  src/lib/                  cliente de API, auth, formateo
docs/API.md                 contrato de la API
```

La integración con ARCA está detrás de la interfaz `ArcaClient`
(`domain/arca-port.ts`), con dos implementaciones intercambiables: la real y la
de demo. El resto de la app no sabe cuál está usando.

### Sobre los importes

Todo el cálculo de dinero se hace en **centavos enteros** y recién al final se
convierte a decimal. Sumar floats redondeados reintroduce el error de coma
flotante (`82.64 + 17.35 = 99.99000000000001`) y ARCA rechaza el comprobante
por diferencias de un centavo entre `ImpTotal` y la suma de sus componentes.
Está cubierto en `server/src/domain/totals.test.ts`.

## Seguridad

- Certificados y claves privadas cifrados en reposo (AES-256-GCM), nunca
  devueltos por la API.
- Sesiones con JWT; contraseñas con bcrypt.
- Aislamiento por estudio en todas las consultas.
- Se guarda el request/response crudo con ARCA de cada comprobante, para
  auditoría y soporte.

Antes de exponer la app a internet: poné `APP_ENCRYPTION_KEY` y `JWT_SECRET`
propios, serví por HTTPS, y hacé backup del archivo de base de datos (o mudá a
PostgreSQL cambiando el `provider` en `schema.prisma`).

## Estado

El modo demo cubre el circuito completo. La integración real implementa WSAA,
WSFEv1 (`FECAESolicitar`, `FECompUltimoAutorizado`, `FECompConsultar`,
`FEParamGetPtosVenta`, `FEParamGetCotizacion`, `FEDummy`) y el padrón A5.
**Antes de facturar en producción, probá primero en homologación** y verificá
un comprobante de cada tipo que vayas a usar.
