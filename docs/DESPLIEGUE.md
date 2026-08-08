# Publicar la app en internet (para usarla desde el celular)

Si querés entrar desde el iPhone, la app tiene que estar corriendo en un
servidor: el teléfono sólo abre una dirección web, no ejecuta el programa.

Esta guía usa **Render**, que se conecta a GitHub y hace todo desde el
navegador. No hace falta instalar nada.

---

## Antes de empezar: leé esto

Publicar la app en internet significa que **cualquiera con la dirección puede
intentar entrar**. Esta app va a guardar los certificados fiscales de tus
clientes, así que:

- El registro de usuarios **se cierra solo** después del primer usuario. Para
  crear otro hace falta la clave `REGISTRATION_KEY`, que Render genera y podés
  ver en el panel.
- Los datos de ejemplo (con la contraseña pública `Demo1234!`) **no se cargan**
  en producción. Vas a crear tu propio usuario la primera vez que entres.
- Poné una contraseña larga y propia. No reutilices ninguna.
- La dirección `.onrender.com` es pública. Si querés que sólo entre tu estudio,
  vas a necesitar restringirlo por otro medio (VPN, dominio propio con acceso
  restringido, etc.).

Si preferís no exponer los certificados a un servicio de terceros, la
alternativa es correr la app en una computadora del estudio y entrar desde el
celular por la red interna. Requiere instalar Node.js: mirá
[PUESTA-EN-MARCHA.md](PUESTA-EN-MARCHA.md).

---

## Paso a paso

### 1. Crear la cuenta

Entrá a <https://render.com> y registrate con tu cuenta de GitHub (la misma
donde está el repositorio).

### 2. Preparar la clave de cifrado

Vas a necesitar **64 caracteres hexadecimales** (números del 0 al 9 y letras
de la A a la F). Es lo que cifra los certificados de ARCA en la base.

Sacala de <https://www.random.org/bytes/>: pedí **32 bytes**, formato
**hexadecimal**, y pegá todo junto sin espacios.

Guardala en algún lado seguro: **si la cambiás después, los certificados que
ya cargaste no se pueden descifrar** y hay que volver a subirlos.

### 3. Desplegar

1. En Render: **New** → **Blueprint**.
2. Elegí el repositorio `galcontable-code/galcosto`.
3. En la rama, poné `claude/arca-billing-app-a7j8m1`.
4. Render lee el archivo `render.yaml` y te muestra lo que va a crear: una
   base de datos y un servicio web.
5. Te va a pedir **`APP_ENCRYPTION_KEY`**: pegá los 64 caracteres del paso 2.
6. **Apply**. La primera construcción tarda unos minutos.

Cuando termine te da una dirección tipo `https://galcosto.onrender.com`.

### 4. Crear tu usuario

Abrí esa dirección en el iPhone y andá a **Crear cuenta**. El primer usuario
se crea sin restricciones; a partir de ahí el registro queda cerrado.

Agregalo a la pantalla de inicio del iPhone (botón compartir → *Agregar a
inicio*) y se comporta como una app.

### 5. Probar en modo demo

Arranca simulando ARCA: podés crear empresas, clientes y emitir comprobantes
con CAE inventado. Recorré todo el circuito antes de conectar ARCA de verdad.

### 6. Conectar ARCA

Cuando quieras facturar en serio:

1. En Render: tu servicio → **Environment** → cambiá `ARCA_DEMO_MODE` a
   `false` → **Save**. El servicio se reinicia solo.
2. Cargá el certificado de cada empresa siguiendo
   [PUESTA-EN-MARCHA.md](PUESTA-EN-MARCHA.md).

---

## Cosas a tener en cuenta del plan gratuito

- **El servicio se duerme** después de un rato sin uso. La primera visita
  después de la siesta tarda cerca de un minuto en responder. Para facturar a
  diario conviene el plan pago más barato.
- **La base gratuita de Render caduca**. Fijate el plazo vigente en su panel:
  si vas a usar esto en serio, pasá la base a un plan pago o hacé backups.
- Los certificados y los comprobantes viven en esa base. **Hacé backups.**

## Otras opciones

El `Dockerfile` de la raíz sirve para cualquier servicio que corra
contenedores (Railway, Fly.io, un VPS propio). Necesita:

- `DATABASE_URL` apuntando a PostgreSQL
- `APP_ENCRYPTION_KEY` (64 hex) y `JWT_SECRET`
- `NODE_ENV=production`

El contenedor sincroniza el esquema al arrancar y sirve la API y el frontend
en el mismo puerto (`PORT`, por defecto 4000).

> **Sin probar:** la imagen de Docker está escrita pero no pude construirla en
> el entorno donde se desarrolló (no había demonio de Docker disponible). Lo
> que sí está verificado es que el esquema de base funciona tanto en SQLite
> como en PostgreSQL, y que la app compila y corre en modo producción. Si la
> construcción falla, mandame el error del log de Render.
