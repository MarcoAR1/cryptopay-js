# Guía Maestra de Integración Frontend y SDK de CryptoPay

Esta guía documenta la integración de la pasarela de pagos CryptoPay en aplicaciones de terceros utilizando el paquete empaquetado `cryptopay-js`.

---

## 1. Tres Modelos de Integración Frontend

CryptoPay ofrece tres niveles de integración adaptados a diferentes requerimientos de diseño y control:

```
+-------------------------------------------------------------------------+
|                    MODELOS DE INTEGRACIÓN FRONTEND                      |
+-------------------------------------------------------------------------+
|  1. Ready-to-Use Widget   |  2. Headless Session Hook | 3. Hosted Checkout Link  |
|  - Drop-in turnkey        |  - Control visual total   | - Redirección externa   |
|  - Estilos automáticos    |  - useCryptoPaySession()  | - 0 código en frontend  |
|  - Modal o Embebido       |  - Tu propio diseño de UI | - Ideal para e-commerce |
+-------------------------------------------------------------------------+
```

### Modelo 1: Ready-to-Use Widget
Ideal para desplegar el checkout en minutos sin diseñar componentes de pago. Los estilos CSS se inyectan automáticamente en tiempo de ejecución.

- **Vanilla HTML / JS:**
  ```html
  <script src="https://unpkg.com/cryptopay-js/dist/checkout.js"></script>
  <div id="checkout-container"></div>
  <script>
    const checkout = CryptoPay.createCheckout({
      baseUrl: 'https://api.gateway.example.com',
      paymentId: 'pay_12345',
      checkoutToken: 'tok_abcde',
      locale: 'es',
      theme: 'dark',
      onSuccess: (data) => console.log('Confirmado:', data.txHash)
    });
    checkout.mount('#checkout-container');
  </script>
  ```

- **React / Next.js:**
  ```tsx
  import { CryptoPayWidget } from 'cryptopay-js/react';

  <CryptoPayWidget
    baseUrl="https://api.gateway.example.com"
    paymentId={paymentId}
    checkoutToken={checkoutToken}
    locale="es"
    theme="dark"
    onSuccess={(data) => console.log('Confirmado:', data.txHash)}
  />
  ```

---

### Modelo 2: Headless Session Hook (`useCryptoPaySession`)
Permite construir una interfaz 100% personalizada con la marca del comercio, delegando la gestión de estado, polling, temporizadores de expiración y ejecución Web3 al hook.

```tsx
import { useCryptoPaySession, CryptoPayStatusBadge } from 'cryptopay-js/react';

function CustomMerchantCheckout({ paymentId, checkoutToken }) {
  const { state, data, error, payWithWallet, cancel } = useCryptoPaySession({
    baseUrl: 'https://api.gateway.example.com',
    paymentId,
    checkoutToken,
    onConfirmed: (d) => alert('¡Pago confirmado en gateway!')
  });

  return (
    <div className="custom-box">
      <h2>Pagar con Cripto</h2>
      <CryptoPayStatusBadge state={state} />
      {error && <p className="error">{error}</p>}
      <button onClick={() => payWithWallet()} disabled={state !== 'AWAITING_PAYMENT'}>
        Pagar con Billetera Conectada
      </button>
      <button onClick={() => cancel()}>Cancelar</button>
    </div>
  );
}
```

---

### Modelo 3: Hosted Checkout Link
Si el comercio no desea incrustar ningún script ni componente en su frontend, puede redirigir al usuario al enlace alojado generado por el backend:

```
https://gateway.example.com/checkout/{paymentId}?token={checkoutToken}
```

---

## 2. Catálogo Completo de Propiedades y Configuración

Propiedades aceptadas por `createCheckout()`, `openModal()` y `<CryptoPayWidget />`:

| Propiedad | Tipo | Requerido | Valor por Defecto | Descripción |
|---|---|---|---|---|
| `baseUrl` | `string` | **Sí** | — | URL base del API Gateway de pagos de CryptoPay. |
| `paymentId` | `string` | **Sí** | — | Identificador de la orden o pago generado por el backend del comercio. |
| `checkoutToken` | `string` | **Sí** | — | Token efímero de sesión de un solo uso emitido por el backend. |
| `locale` | `'es' \| 'en' \| 'pt' \| 'de'` | No | `'es'` | Idioma de la interfaz de usuario. |
| `theme` | `'dark' \| 'light'` | No | `'dark'` | Tema visual de la pasarela. |
| `defaultView` | `'qr' \| 'wallet'` | No | `'qr'` | Vista inicial seleccionada al montar el widget. |
| `customStyles` | `Record<string, string>` | No | `{}` | Sobrescritura de variables de estilo CSS personalizadas. |
| `onSuccess` | `(data: PaymentSuccessData) => void` | No | `undefined` | Callback disparado cuando el pago es confirmado on-chain y acreditado en el gateway. |
| `onError` | `(error: Error) => void` | No | `undefined` | Callback disparado ante errores irrecuperables o cancelaciones. |
| `onStatusChange` | `(state: CheckoutState) => void` | No | `undefined` | Callback disparado ante cualquier cambio de estado del ciclo de vida. |
| `onCancel` | `() => void` | No | `undefined` | Callback disparado si el usuario cancela la sesión. |

---

## 3. Catálogo de Eventos y Ciclo de Vida

El estado del checkout transiciona a lo largo de los siguientes estados canónicos (`CheckoutState`):

```
INITIALIZING ---> AWAITING_PAYMENT ---> WALLET_PREPARING ---> CONFIRMING ---> CONFIRMED
       |                  |
       |                  +---> CANCELLED
       |                  +---> EXPIRED
       +----------------------> FAILED
```

| Estado | Significado | Acción del Comercio Recomendada |
|---|---|---|
| `INITIALIZING` | Conectando con el gateway y validando el token de sesión. | Mostrar spinner o skeleton loader. |
| `AWAITING_PAYMENT` | Sesión activa esperando depósito o firma del comprador. | Mostrar código QR o botón de billetera. |
| `WALLET_PREPARING` | Usuario interactuando con MetaMask / Billetera Web3 para firmar la transacción. | Indicar al usuario que confirme la transacción en su billetera. |
| `CONFIRMING` | Transacción emitida en la mempool, esperando profundidad de finalidad en la blockchain. | Mostrar indicador de progreso de confirmaciones de bloque. |
| `CONFIRMED` | Fondos liquidados con éxito en la cadena y registrados en el gateway. | Redirigir a página de éxito y habilitar descarga/entrega. |
| `FAILED` | Fallo irrecuperable (firma rechazada, fondos insuficientes en gasless, etc.). | Ofrecer reintento con otro método de pago. |
| `EXPIRED` | El tiempo de validez del token o la cotización ha expirado. | Generar una nueva sesión desde el backend. |
| `CANCELLED` | El usuario canceló la operación voluntariamente. | Devolver al carrito de compras. |
| `REVIEW` | Pago requiere revisión manual de tesorería (fondos excepcionales). | Contactar a soporte o esperar resolución de discrepancia. |

---

## 4. Catálogo de Errores y Estrategias de Recuperación

| Código / Mensaje | Causa Raíz | Estrategia de Mitigación / Recuperación |
|---|---|---|
| `SESSION_EXPIRED` | El token de checkout ha superado su TTL (tiempo de vida). | Solicitar un nuevo `checkoutToken` al backend mediante un reintento transparente. |
| `UNSUPPORTED_CHAIN` | La billetera del usuario está en una red distinta a la requerida. | El widget solicita automáticamente el cambio de red vía `wallet_switchEthereumChain`. |
| `USER_REJECTED` | El usuario rechazó la firma de la transacción en su extensión. | Permitir al usuario volver a hacer clic en "Pagar con Billetera" o usar el código QR. |
| `INSUFFICIENT_FUNDS` | El comprador no posee el balance necesario de tokens USDT. | Mostrar el saldo requerido y ofrecer pagar desde otra dirección. |
| `INVALID_CONTRACT_GUARD` | Se intentó transferir fondos a la dirección del propio contrato de token. | **Invariante de seguridad activo:** el widget bloquea la generación del QR para proteger los fondos. |
| `NETWORK_DISCONNECTED` | Pérdida de conexión a internet durante el sondeo. | El sondeo del widget se ralentiza y reintenta automáticamente con backoff exponencial. |

---

## 5. Matriz de Compatibilidad

### Navegadores Soportados
| Navegador | Versión Mínima | Soporte QR | Soporte Web3 Injected | Observaciones |
|---|---|---|---|---|
| **Google Chrome** | 90+ | ✅ 100% | ✅ EIP-1193 | Soporte completo |
| **Mozilla Firefox** | 90+ | ✅ 100% | ✅ EIP-1193 | Soporte completo |
| **Apple Safari** | 14+ | ✅ 100% | ✅ Extensiones Web3 | Requiere HTTPS para portapapeles |
| **Microsoft Edge** | 90+ | ✅ 100% | ✅ EIP-1193 | Soporte completo |
| **Brave Browser** | Todas | ✅ 100% | ✅ Brave Wallet / Injected | Soporte nativo |
| **Mobile Safari / Chrome** | iOS 14+ / Android 10+ | ✅ 100% | ✅ Deep Links / Billeteras Móviles | Abre billeteras compatibles vía deep link |

### Billeteras Verificadas
- **MetaMask** (Extensión de Navegador y Mobile Browser)
- **Coinbase Wallet**
- **Brave Wallet**
- **Rabby Wallet**
- **Rainbow**
- Cualquier billetera compatible con el estándar **EIP-1193** (`window.ethereum`)

### Redes Blockchain Verificadas
| Red | Chain ID | Tipo | Métodos Soportados |
|---|---|---|---|
| **Sepolia Testnet** | `11155111` | Sandbox / Pruebas | `DIRECT` (HD Wallet) y `CONTRACT` (Gasless Permit EIP-2612) |
| **Arbitrum Sepolia** | `421614` | Rollup L2 (Beta) | `DIRECT` y `CONTRACT` |

---

## 6. Principios de Seguridad para el Comercio (Zero-Trust)

1. **Precios Exclusivamente del Servidor:**
   El frontend **nunca** calcula ni envía montos financieros al gateway. La orden se crea siempre en el backend del comercio (`CryptoPayNodeClient`), que fija el importe exacto.
2. **Cero Secretos en el Frontend:**
   La clave privada del comercio (`CRYPTOPAY_API_KEY`) y el secreto de webhook (`CRYPTOPAY_WEBHOOK_SECRET`) **jamás** deben incluirse en código de navegador.
3. **Verificación Estricta de Webhooks:**
   Las notificaciones del servidor deben validarse obligatoriamente mediante `verifyWebhook` utilizando el cuerpo crudo de la petición (`rawBody`) para garantizar integridad y evitar falsificaciones.
4. **Idempotencia en la Entrega:**
   El backend del comercio debe registrar los `eventId` de los webhooks en un almacén idempotente para ignorar entregas duplicadas de la red.
