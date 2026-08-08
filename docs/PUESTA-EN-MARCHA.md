# Puesta en marcha con credenciales reales de ARCA

Guía para pasar del modo demo a facturar de verdad. Hacelo **primero en
homologación**: los comprobantes no tienen validez fiscal y la numeración no
avanza en producción.

---

## 1. Levantar la app

Necesitás Node.js 20 o superior.

```bash
git clone <url-del-repo> galcosto
cd galcosto
git checkout claude/arca-billing-app-a7j8m1

cp .env.example .env
npm run setup     # instala, crea la base y carga datos de ejemplo
npm run dev       # API en :4000, frontend en :5173
```

Entrá a <http://localhost:5173>:

```
usuario ....... demo@galcosto.app
contraseña .... Demo1234!
```

Arranca en **modo demo**: podés recorrer todo el circuito sin certificados,
con CAE simulado. Confirmá que todo funciona antes de seguir.

## 2. Preparar el `.env` para el modo real

```bash
# Generá tus propias claves (no uses las del ejemplo)
openssl rand -hex 32     # -> pegalo en APP_ENCRYPTION_KEY
openssl rand -hex 32     # -> pegalo en JWT_SECRET
```

```dotenv
ARCA_DEMO_MODE=false
APP_ENCRYPTION_KEY=<los 64 caracteres hex del primer comando>
JWT_SECRET=<el segundo>
```

> `APP_ENCRYPTION_KEY` cifra los certificados en la base. Si la cambiás
> después de haber cargado credenciales, no se van a poder descifrar y hay
> que volver a subirlas.

Reiniciá la app (`Ctrl+C` y `npm run dev`).

## 3. Generar la clave y el pedido de certificado

```bash
openssl genrsa -out empresa.key 2048

openssl req -new -key empresa.key \
  -subj "/C=AR/O=<RAZON SOCIAL>/CN=galcosto/serialNumber=CUIT <CUIT SIN GUIONES>" \
  -out empresa.csr
```

El `serialNumber` tiene que decir literalmente `CUIT ` seguido del número sin
guiones. Si no coincide con el CUIT que después cargás en la app, ARCA
rechaza la autenticación.

Guardá `empresa.key` con cuidado: no se puede volver a generar, y sin ella el
certificado no sirve.

## 4. Obtener el certificado

### Homologación (para probar)

1. Entrá a **WSASS**: <https://wsass-homo.afip.gob.ar/wsass/portal/main.aspx>
2. *Crear DN y obtener certificado* → pegá el contenido del `.csr` → descargá
   el `.crt`.
3. *Adherir servicio* (o *Asociar DN a servicio*) → elegí
   **wsfe — Facturación Electrónica**.
4. Si vas a usar el buscador de CUIT, adherí también
   **ws_sr_padron_a5**.

### Producción (cuando ya probaste)

Con clave fiscal nivel 3 en el portal de ARCA:

1. **Administración de Certificados Digitales** → subí el `.csr`, descargá el
   `.crt`. Anotá el alias que le pusiste.
2. **Administrador de Relaciones de Clave Fiscal** → *Nueva Relación* →
   *Buscar* → **Facturación Electrónica (wsfe)** → asociá el certificado por
   su alias.
3. Repetí para **ws_sr_padron_a5** si querés el lookup de CUIT.

Los certificados de homologación y producción son **distintos**: el de
homologación no sirve en producción ni al revés.

## 5. Cargar el certificado en la app

1. **Empresas → Nueva empresa**. Cargá razón social, CUIT, condición frente
   al IVA, domicilio, ingresos brutos y punto de venta. Dejá el entorno en
   **Homologación**.
   - Los datos fiscales salen impresos en el comprobante: tienen que
     coincidir con los que ARCA tiene registrados.
2. En el detalle de la empresa, pegá el contenido de `empresa.crt` y de
   `empresa.key` (los dos completos, con las líneas `-----BEGIN...` y
   `-----END...`).
3. **Cargar credenciales**. Debería mostrarte el titular del certificado y su
   vencimiento.
4. **Probar conexión**. Si responde `AppServer OK · DbServer OK · AuthServer
   OK` y te da un ticket de acceso, ya estás autenticado contra ARCA.
5. **Ver puntos de venta** te trae los que ARCA tiene habilitados para ese
   CUIT. Usá uno de esos: si facturás contra un punto de venta inexistente o
   bloqueado, el comprobante se rechaza.

## 6. Emitir la primera factura

**Facturar** → cliente → ítems → *Emitir y obtener CAE*.

Probá al menos un comprobante de **cada tipo que vayas a usar** (A, B, C,
nota de crédito) antes de pasar a producción. El detalle del comprobante
tiene un panel **"Ver respuesta de ARCA"** con el XML crudo que se envió y se
recibió: es lo primero que hay que mirar cuando algo se rechaza.

## 7. Pasar a producción

En el detalle de la empresa, cambiá el entorno a **Producción** y cargá el
certificado de producción. Desde ese momento los comprobantes son
fiscalmente válidos y la numeración avanza de verdad; los errores se
corrigen con notas de crédito, no borrando.

Antes de exponer la app a internet: serví por HTTPS, poné claves propias, y
hacé backup del archivo de base de datos (o mudá a PostgreSQL cambiando el
`provider` en `server/prisma/schema.prisma`).

---

## Errores frecuentes

| Qué ves | Qué suele ser |
|---|---|
| `ARCA_CONFIG_ERROR: no tiene cargado el certificado` | La empresa no tiene credenciales, o `ARCA_DEMO_MODE=false` sin haberlas subido. |
| `ARCA respondio HTTP 403 en FEDummy` | No hay salida de red hacia `afip.gov.ar` (firewall, proxy corporativo). |
| `Certificado o clave incorrectos` al subir | El `.crt` y la `.key` no son par, o pegaste sólo una parte del PEM. |
| `ns1:cms.cert.untrusted` / `Certificado no emitido por AC de confianza` | Estás usando un certificado autofirmado, o el de homologación contra producción. |
| `El CEE ya posee un TA valido` | Pediste tickets de acceso de más. La app los cachea 12 h; esperá unos minutos. |
| `computador no autorizado a acceder al servicio` | Falta asociar **wsfe** al certificado en el Administrador de Relaciones. |
| `10016 — El numero de comprobante no es correlativo` | La numeración local quedó desfasada de la de ARCA. Reintentá: el número se resuelve consultando a ARCA. |
| `10015 — Punto de venta no autorizado` | Ese punto de venta no existe en ARCA o no es de tipo web service. |
| `El campo CondicionIVAReceptorId es obligatorio` | Falta la condición frente al IVA del receptor (RG 5616). Cargala en el cliente. |

## Qué está probado y qué no

Probado de punta a punta contra el **cliente demo**: emisión con CAE,
numeración correlativa, IVA por alícuota, notas de crédito, PDF con QR,
padrón, y todo el circuito de la interfaz.

**No probado**: el handshake real contra los servidores de ARCA (WSAA con
firma CMS y WSFEv1). El código está completo y los caminos de error
responden con mensajes claros, pero la primera prueba real es la tuya: por
eso conviene empezar en homologación.
