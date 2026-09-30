# Dashboard de transacciones

Dashboard estático para analizar movimientos de inversión. Permite importar el
CSV consolidado, filtrar operaciones y guardar la base localmente en IndexedDB.

## Privacidad

Los datos financieros no se suben a GitHub ni a Cloudflare. El sitio publicado
se genera vacío y cada usuario carga el CSV directamente en su navegador. El
archivo queda almacenado solamente en ese navegador y dominio.

No agregues archivos `.csv` al repositorio. Están excluidos por `.gitignore`.

## Desarrollo local

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Para generar una copia local con datos incorporados, sin subirla al repositorio:

```bash
DATA_FILE=/ruta/privada/transacciones.csv npm run build:with-data
```

## Publicar con GitHub y Cloudflare Pages

1. Crea un repositorio privado en GitHub y sube estos archivos.
2. En Cloudflare abre **Workers & Pages** y selecciona **Create application**.
3. Elige **Pages**, conecta GitHub y selecciona el repositorio.
4. Configura:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`
5. Guarda y publica. Cada cambio enviado a la rama principal se desplegará
   automáticamente.

También puedes desplegarlo desde tu computador:

```bash
npm install
npx wrangler login
npm run deploy
```

## Primera carga en el nuevo dominio

El almacenamiento del navegador está separado por dominio. Después de abrir la
URL de Cloudflare por primera vez, pulsa **Actualizar datos**, selecciona el CSV
consolidado y usa **Reemplazar**. Solo es necesario hacerlo una vez por navegador.
