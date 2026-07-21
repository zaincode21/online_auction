/**
 * Ishema Mobile Money debit client
 * Uses MOBILE_MONEY_API_URL exactly as configured (e.g. https://api.payment.ishema.rw)
 * Set MOBILE_MONEY_SIMULATE=true to skip live Ishema calls during local testing.
 * Live URL typically: http://api.ishema.rw/api/v1/debit (or the exact path from Ishema).
 *
 * Request body fields (from mopay RequestClientPaymentListener):
 *   token, amount, msisdn, phone_number, client_name,
 *   external_id, callback_url, post_back_url
 *
 * Response:
 *   status: -1 created | 0 initiated | 1 pending | 2 complete | 3 fail
 *   message, reason?, reference_id?
 */

const crypto = require('crypto');

const STATUS = {
  CREATED: -1,
  INITIATED: 0,
  PENDING: 1,
  COMPLETE: 2,
  FAIL: 3,
};

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('250') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `250${digits.slice(1)}`;
  if (digits.length === 9) return `250${digits}`;
  return digits;
}

function resolveDebitUrl() {
  // Use MOBILE_MONEY_API_URL exactly (set full debit URL in .env)
  return (process.env.MOBILE_MONEY_API_URL || '').replace(/\/$/, '');
}

/**
 * Initiate a live Mobile Money debit.
 * @returns {{ ok: boolean, data?: object, error?: string, pending?: boolean, referenceId?: string }}
 */
async function initiateDebit({ amount, phone, clientName, email, externalId, description }) {
  const debitUrl = resolveDebitUrl();
  const apiKey = process.env.MOBILE_MONEY_API_KEY;
  const callbackUrl = process.env.MOBILE_MONEY_CALLBACK_URL;
  const simulate = process.env.MOBILE_MONEY_SIMULATE === 'true';
  console.log(`[MobileMoney] mode=${simulate ? 'SIMULATE' : 'LIVE'} url=${debitUrl || '(none)'}`);

  if (!debitUrl || !apiKey) {
    return { ok: false, error: 'Mobile money is not configured. Set MOBILE_MONEY_API_URL and MOBILE_MONEY_API_KEY.' };
  }

  const msisdn = normalizePhone(phone);
  if (!msisdn || msisdn.length < 10) {
    return { ok: false, error: 'Enter a valid Rwanda mobile number (e.g. 078xxxxxxx).' };
  }

  const payAmount = Math.round(Number(amount));
  if (!Number.isFinite(payAmount) || payAmount < 1) {
    return { ok: false, error: 'Invalid payment amount.' };
  }

  if (payAmount > 2_000_000 && process.env.MOBILE_MONEY_SIMULATE !== 'true') {
    return {
      ok: false,
      error: `Amount ${payAmount.toLocaleString()} RWF is too large for one Mobile Money charge. Pay up to 2,000,000 RWF per request.`,
    };
  }

  if (simulate) {
    console.log(`[MobileMoney] SIMULATE full pay amount=${payAmount} msisdn=${msisdn} ref=${externalId}`);
    return {
      ok: true,
      pending: false,
      complete: true,
      data: { simulated: true, amount: payAmount, msisdn, externalId },
    };
  }

  if (!callbackUrl || callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1')) {
    console.warn(
      '[MobileMoney] WARNING: CALLBACK_URL is local. Ishema cannot reach it. Payment may stay pending until you set a public URL (ngrok/cloudflare tunnel).'
    );
  }

  // Exact mopay-compatible payload — token must be in the body
  const payload = {
    token: apiKey,
    amount: String(payAmount),
    msisdn,
    phone_number: msisdn,
    client_name: clientName || 'GavelPro Buyer',
    external_id: externalId,
    callback_url: callbackUrl || undefined,
    post_back_url: callbackUrl || undefined,
    credit_number: process.env.MOBILE_MONEY_ACCOUNT_PHONE || undefined,
    // extras (ignored if provider does not use them)
    email: email || undefined,
    details: description || `GavelPro payment ${externalId}`,
  };

  try {
    console.log(`[MobileMoney] LIVE debit ${debitUrl} amount=${payAmount} msisdn=${msisdn} ref=${externalId}`);
    const res = await fetch(debitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    console.log('[MobileMoney] response', res.status, JSON.stringify(data).slice(0, 500));

    if (!res.ok) {
      const message =
        data?.message || data?.reason || data?.error || `Payment provider HTTP ${res.status}`;
      return { ok: false, error: message, data };
    }

    const status = Number(data.status);
    const message = data.message || '';
    const referenceId = data.reference_id || data.referenceId || null;

    // FAIL
    if (status === STATUS.FAIL || status === 3) {
      return {
        ok: false,
        error: data.reason || message || 'Payment failed at provider.',
        data,
      };
    }

    // PENDING / INITIATED / COMPLETE all count as successfully submitted
    const pending = status === STATUS.PENDING || status === STATUS.INITIATED || status === 0 || status === 1;
    const complete = status === STATUS.COMPLETE || status === 2;

    return {
      ok: true,
      pending: pending && !complete,
      complete: !!complete,
      referenceId,
      data,
    };
  } catch (err) {
    const cause = err.cause?.code || err.cause?.message || err.cause || '';
    console.error('[MobileMoney] network error:', err.message, cause || '');
    const hint = String(cause).includes('UNRECOGNIZED_NAME') || String(cause).includes('CERT')
      ? ' (TLS/certificate problem on Ishema host — check MOBILE_MONEY_API_URL)'
      : '';
    return {
      ok: false,
      error: `Could not reach payment provider: ${err.message}${cause ? ` [${cause}]` : ''}${hint}`,
    };
  }
}

function isSuccessfulCallback(body = {}) {
  const status = body.status ?? body.payment_status ?? body.state;
  const num = Number(status);
  if (num === STATUS.COMPLETE || num === 2) return true;
  const s = String(status).toLowerCase();
  return ['success', 'successful', 'paid', 'completed', 'complete', 'ok'].includes(s)
    || body.success === true;
}

function isFailedCallback(body = {}) {
  const status = body.status ?? body.payment_status ?? body.state;
  const num = Number(status);
  if (num === STATUS.FAIL || num === 3) return true;
  const s = String(status).toLowerCase();
  return ['failed', 'failure', 'fail', 'cancelled', 'canceled', 'error'].includes(s);
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function timingSafeEqualUtf8(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Verify inbound Mobile Money webhook using MOBILE_MONEY_WEBHOOK_SECRET.
 * Accepts HMAC-SHA256 (hex) of the raw body, with or without a sha256= prefix,
 * or a shared-secret header that exactly matches the configured secret.
 *
 * @returns {{ ok: boolean, error?: string }}
 */
function verifyWebhookSignature(req) {
  const secret = process.env.MOBILE_MONEY_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: false, error: 'MOBILE_MONEY_WEBHOOK_SECRET is not configured.' };
  }

  const headerSig =
    req.get('x-signature') ||
    req.get('x-webhook-signature') ||
    req.get('x-hub-signature-256') ||
    req.get('x-ishema-signature') ||
    '';

  const provided =
    headerSig ||
    req.get('x-webhook-secret') ||
    req.query?.signature ||
    req.query?.token ||
    '';

  if (!provided) {
    return { ok: false, error: 'Missing webhook signature.' };
  }

  // Shared-secret header / query token (exact match)
  if (timingSafeEqualUtf8(provided, secret)) {
    return { ok: true };
  }

  const raw = req.rawBody
    ? (Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody))
    : Buffer.from(JSON.stringify(req.body || {}));

  const digestHex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const digestBase64 = crypto.createHmac('sha256', secret).update(raw).digest('base64');

  let candidate = String(provided).trim();
  if (candidate.toLowerCase().startsWith('sha256=')) {
    candidate = candidate.slice(7);
  }

  if (timingSafeEqualHex(candidate, digestHex) || timingSafeEqualUtf8(candidate, digestBase64)) {
    return { ok: true };
  }

  return { ok: false, error: 'Invalid webhook signature.' };
}

module.exports = {
  initiateDebit,
  normalizePhone,
  isSuccessfulCallback,
  isFailedCallback,
  verifyWebhookSignature,
  STATUS,
};
