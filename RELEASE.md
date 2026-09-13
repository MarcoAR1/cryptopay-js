# Protocolo de Publicación y Release — `@cryptopayjs/sdk`

Este documento describe el procedimiento de release, autenticación y políticas de publicación para el paquete público `@cryptopayjs/sdk` alojado en el registro oficial de npm.

---

## 1. Configuración de Autenticación en npmjs.com

Para habilitar la publicación automática desde GitHub Actions hacia la organización `cryptopayjs`, configure una de las siguientes dos opciones:

### Opción A: OIDC Trusted Publishing (Recomendado — Zero Secrets)
npm soporta autenticación criptográfica delegada (OIDC) sin necesidad de generar ni almacenar tokens secretos:
1. Inicie sesión en [npmjs.com](https://www.npmjs.com) con su cuenta de la organización `cryptopayjs`.
2. Vaya a la configuración del paquete o cree el paquete inicial `@cryptopayjs/sdk`.
3. Seleccione **Settings** > **Publishing Access** > **Add GitHub Actions Publisher**.
4. Ingrese los datos de su repositorio:
   - **GitHub Organization / User:** `MarcoAR1`
   - **Repository:** `cryptopay-js`
   - **Workflow file name:** `publish.yml`
   - **Branch:** `main`
5. Al guardar, GitHub Actions tendrá autorización automática para publicar con sello de procedencia verificada (`--provenance`).

### Opción B: Token de Automatización (`NPM_TOKEN`)
Si prefiere autenticar con token de acceso clásico:
1. En [npmjs.com](https://www.npmjs.com), haga clic en su avatar > **Access Tokens** > **Generate New Token** > **Automation** (o Granular con permisos Read and Write sobre el scope `@cryptopayjs`).
2. Copie el token generado.
3. En GitHub, navegue al repositorio `MarcoAR1/cryptopay-js` > **Settings** > **Secrets and variables** > **Actions**.
4. Cree un nuevo secreto denominado `NPM_TOKEN` y pegue el valor del token.

---

## 2. Flujo de Release Automatizado

El workflow [`.github/workflows/publish.yml`](.github/workflows/publish.yml) se ejecuta automáticamente bajo dos condiciones:
1. **Push a `main` que modifique `package.json`**:
   - Incrementa la versión en `package.json` (ej: `2.0.0-rc.2` o `2.0.0`).
   - Ejecuta `npm run build` y `npm test`.
   - Verifica los hashes de integridad en `provenance.json`.
   - Hace commit y push a `main`.
   - GitHub Actions detecta que la versión local difiere de la publicada en npm y ejecuta `npm publish --access public --provenance`.
2. **Disparo Manual (`workflow_dispatch`)**:
   - Puede ejecutarse manualmente desde la pestaña **Actions** en GitHub seleccionando el workflow `Publish @cryptopayjs/sdk to npm` y haciendo clic en **Run workflow**.

---

## 3. Lista de Verificación Previa (Checklist)

Antes de promover una versión a producción:

- [x] **Aislamiento:** El archivo `package.json` incluye la directiva `"files": ["dist/", "README.md", "LICENSE", "provenance.json", "scripts/verify-package.cjs"]`, excluyendo código privado del servidor, archivos `.env`, y suites de prueba internas.
- [x] **Tipos y Declaraciones:** `dist/index.d.ts`, `dist/react/index.d.ts` y todas las definiciones TypeScript se compilan correctamente.
- [x] **Integridad Criptográfica:** `node scripts/verify-package.cjs --release` confirma 0 discrepancias de hash y árbol de git limpio (`provenance.dirty === false`).
- [x] **Compatibilidad:** Pruebas de consumidor CJS, ESM y entornos puros Node.js pasan al 100%.

---

## 4. Política de Rollback y Deprecación

- **Despublicación (`npm unpublish`):** npm solo permite despublicar versiones dentro de las primeras 72 horas desde su publicación y únicamente si ningún otro paquete depende de ella.
- **Deprecación (`npm deprecate`):** Ante cualquier hallazgo crítico o versión retirada, marque la versión como deprecada con un mensaje explicativo y recomendación de actualización:
  ```bash
  npm deprecate @cryptopayjs/sdk@2.0.0-rc.1 "Esta versión preliminar ha sido reemplazada por v2.0.0. Actualice inmediatamente."
  ```
