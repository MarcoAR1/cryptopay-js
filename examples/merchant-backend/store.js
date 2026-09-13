/**
 * In-memory Store for Merchant Demo
 * Demonstrates:
 * 1. Fixed server-side catalog (preventing client-side price tampering)
 * 2. Order lifecycle tracking
 * 3. Idempotent webhook inbox (guaranteeing exactly-once fulfillment against replays)
 */

class MerchantStore {
  constructor() {
    // Fixed catalog: client can only request productId, NEVER amount or currency
    this.catalog = new Map([
      ['prod_coffee_beans', { id: 'prod_coffee_beans', name: 'Ethiopian Yirgacheffe (250g)', amount: '15.00', currency: 'USDT' }],
      ['prod_espresso_cup', { id: 'prod_espresso_cup', name: 'Ceramic Espresso Cup', amount: '8.50', currency: 'USDT' }],
      ['prod_subscription_month', { id: 'prod_subscription_month', name: 'Roaster Subscription (1 Month)', amount: '29.99', currency: 'USDT' }],
    ]);

    this.orders = new Map();
    this.inbox = new Map(); // eventId -> { receivedAt, processed: boolean }
    this.auditLog = [];
  }

  getProduct(productId) {
    return this.catalog.get(productId);
  }

  createOrder(productId, customerEmail) {
    const product = this.getProduct(productId);
    if (!product) {
      throw new Error(`Product not found: ${productId}`);
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const order = {
      orderId,
      productId: product.id,
      productName: product.name,
      amount: product.amount,
      currency: product.currency,
      customerEmail: customerEmail || 'customer@example.com',
      status: 'PENDING',
      paymentId: null,
      delivered: false,
      fulfillmentCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.orders.set(orderId, order);
    return order;
  }

  attachPaymentId(orderId, paymentId) {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    order.paymentId = paymentId;
    order.updatedAt = new Date().toISOString();
    return order;
  }

  getOrder(orderId) {
    return this.orders.get(orderId);
  }

  /**
   * Process incoming webhook event with idempotent inbox protection
   * Returns: { status: 'PROCESSED' | 'DUPLICATE' | 'IGNORED', order: Order | null }
   */
  processWebhookEvent(event) {
    const { eventId, event: eventType, orderId, transactionId, status } = event;

    // 1. Check inbox for replay protection
    if (this.inbox.has(eventId)) {
      this.auditLog.push({ eventId, eventType, orderId, action: 'REPLAY_IGNORED', timestamp: new Date().toISOString() });
      return { status: 'DUPLICATE', order: orderId ? this.orders.get(orderId) : null };
    }

    // Record in inbox immediately
    this.inbox.set(eventId, {
      eventId,
      eventType,
      receivedAt: new Date().toISOString(),
      processed: true,
    });

    // 2. Handle relevant payment events
    if (eventType === 'PAYMENT_CONFIRMED' || eventType === 'PAYMENT_SETTLED') {
      const order = this.orders.get(orderId);
      if (!order) {
        this.auditLog.push({ eventId, eventType, orderId, action: 'ORDER_NOT_FOUND', timestamp: new Date().toISOString() });
        return { status: 'ORDER_NOT_FOUND', order: null };
      }

      // Safe state transition
      if (!order.delivered) {
        order.status = 'PAID';
        order.delivered = true;
        order.fulfillmentCount += 1;
        order.transactionId = transactionId;
        order.paidAt = new Date().toISOString();
        order.updatedAt = new Date().toISOString();

        this.auditLog.push({
          eventId,
          eventType,
          orderId,
          action: 'PRODUCT_DELIVERED',
          fulfillmentCount: order.fulfillmentCount,
          timestamp: new Date().toISOString(),
        });

        return { status: 'PROCESSED', order };
      } else {
        // Order was already fulfilled (e.g. through another event)
        order.fulfillmentCount += 0; // No duplicate delivery
        this.auditLog.push({
          eventId,
          eventType,
          orderId,
          action: 'ALREADY_DELIVERED',
          timestamp: new Date().toISOString(),
        });
        return { status: 'DUPLICATE', order };
      }
    }

    if (eventType === 'PAYMENT_EXPIRED' || eventType === 'PAYMENT_FAILED') {
      const order = this.orders.get(orderId);
      if (order && order.status === 'PENDING') {
        order.status = 'EXPIRED';
        order.updatedAt = new Date().toISOString();
        this.auditLog.push({ eventId, eventType, orderId, action: 'ORDER_EXPIRED', timestamp: new Date().toISOString() });
      }
      return { status: 'PROCESSED', order };
    }

    return { status: 'IGNORED', order: null };
  }
}

module.exports = { MerchantStore };
