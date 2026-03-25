// lib/ocr-ai.ts
// OCR con IA usando GPT-4o Vision — llama al API route /api/ocr (server-side key)
//
// NOTA SOBRE MONEDA:
// Este archivo extrae los valores TAL COMO APARECEN en la factura (ej: 37.21 USD).
// La conversión a DOP se realiza en ocr-upload.tsx usando la tasa de cambio extraída.
// El campo `moneda` y `tasaCambio` son los que determinan si aplica conversión.

const RNC_CODEALARMA = '130196036';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FacturaOCRData {
  fechaEmision:          string | null;
  ncf:                   string | null;
  idFactura:             string | null;
  suplidor:              string | null;
  rncSuplidor:           string | null;
  rncCodeAlarm:          string | null;
  rncCodeAlarmUbicacion: string | null;
  moneda:                string | null;
  tasaCambio:            string | null;
  subtotal:              number | null;
  descuento:             number | null;
  itbis:                 number | null;
  xLey:                  number | null;
  total:                 number | null;
  rncCodeAlarmConfirmado: boolean;
  _type: 'factura';
}

export interface ComprobanteOCRData {
  pagoa:          string | null;
  monto:          string | null;
  montoNumerico:  number | null;
  fechaPago:      string | null;
  numeroCuenta:   string | null;
  nroReferencia:  string | null;
  descripcion:    string | null;
  _type: 'comprobante';
}

export type AIEvidenceData = FacturaOCRData | ComprobanteOCRData;

// ─── Validación de factura ────────────────────────────────────────────────────

export interface FacturaValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  rncCodeAlarmStatus: 'confirmado' | 'no_encontrado' | 'no_coincide';
}

export function validateFacturaData(data: FacturaOCRData): FacturaValidation {
  const errors: string[]   = [];
  const warnings: string[] = [];

  if (!data.fechaEmision) errors.push('Fecha de emisión no detectada');
  if (!data.ncf)          errors.push('NCF (Número de Comprobante Fiscal) no detectado');
  if (!data.idFactura)    errors.push('ID o número de factura no detectado');
  if (!data.suplidor)     errors.push('Nombre del suplidor no detectado');
  if (!data.rncSuplidor)  errors.push('RNC del suplidor no detectado');
if (!data.moneda)       warnings.push('Moneda no detectada — se asumirá DOP');  if (data.subtotal === null || data.subtotal === undefined) errors.push('Subtotal no detectado');
  if (data.itbis   === null || data.itbis   === undefined)  errors.push('ITBIS no detectado');
  if (data.total   === null || data.total   === undefined)  errors.push('Total no detectado');

  // Si la moneda no es DOP, la tasa de cambio es obligatoria
  if (data.moneda && data.moneda.toUpperCase() !== 'DOP' && !data.tasaCambio) {
    errors.push('Tasa de cambio requerida para moneda distinta a DOP');
  }

  // Validar que la tasa sea un número válido si existe
  if (data.tasaCambio) {
    const tasa = parseFloat(data.tasaCambio);
    if (isNaN(tasa) || tasa <= 0) {
      errors.push('Tasa de cambio inválida — debe ser un número mayor a 0');
    }
  }

  // Advertencia si los montos no cuadran (validación en moneda original)
  if (data.subtotal && data.itbis && data.total) {
    const calculado = (data.subtotal - (data.descuento ?? 0)) + data.itbis + (data.xLey ?? 0);
    if (Math.abs(calculado - data.total) > 1) {
      warnings.push(`Los montos no cuadran: subtotal+ITBIS = ${calculado.toFixed(2)}, total declarado = ${data.total}`);
    }
  }

  const rncIA  = (data.rncCodeAlarm ?? '').toString().replace(/\D/g, '');
  const rncRef = RNC_CODEALARMA.replace(/\D/g, '');
  let rncCodeAlarmStatus: FacturaValidation['rncCodeAlarmStatus'] = 'no_encontrado';

  if (rncIA && rncIA === rncRef) {
    rncCodeAlarmStatus = 'confirmado';
  } else if (rncIA && rncIA !== rncRef) {
    rncCodeAlarmStatus = 'no_coincide';
    warnings.push(`RNC encontrado (${data.rncCodeAlarm}) no coincide con el RNC de CodeAlarm`);
  } else {
    warnings.push('No se encontró el RNC de CodeAlarm (130196036) en esta factura. Verifica manualmente.');
  }

  return { valid: errors.length === 0, errors, warnings, rncCodeAlarmStatus };
}

// ─── Validación de comprobante ────────────────────────────────────────────────

export interface ComprobanteValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  nombreCoincide: boolean;
}

export function validateComprobanteData(
  data: ComprobanteOCRData,
  nombreEsperado: string,
): ComprobanteValidation {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!data.pagoa)         errors.push('Nombre del beneficiario no detectado');
  if (!data.monto)         errors.push('Monto no detectado');
  if (!data.fechaPago)     errors.push('Fecha de pago no detectada');
  if (!data.numeroCuenta)  errors.push('Número de cuenta no detectado');
  if (!data.nroReferencia) errors.push('Número de referencia no detectado');
  if (!data.descripcion)   errors.push('Descripción/concepto no detectado');

  let nombreCoincide = false;
  if (data.pagoa && nombreEsperado) {
    const normalize = (s: string) =>
      s.toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .trim();

    const nombreOCR = normalize(data.pagoa);
    const nombreReq = normalize(nombreEsperado);
    const wordsOCR  = nombreOCR.split(/\s+/).filter(w => w.length >= 4);
    const wordsReq  = nombreReq.split(/\s+/).filter(w => w.length >= 4);
    nombreCoincide  = wordsOCR.some(w => wordsReq.includes(w));

    if (!nombreCoincide) {
      errors.push(
        `El nombre en el comprobante ("${data.pagoa}") no coincide con el solicitante ("${nombreEsperado}"). No se puede completar.`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings, nombreCoincide };
}

// ─── Llamada a GPT-4o para FACTURA ───────────────────────────────────────────

export async function extractFacturaWithAI(imageDataUrl: string): Promise<FacturaOCRData> {
  const base64 = imageDataUrl.split(',')[1];
  const mimeMatch = imageDataUrl.match(/data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const prompt = `Eres un extractor OCR de alta precisión para facturas dominicanas. Analiza la imagen completa con detalle.

INSTRUCCIÓN CRÍTICA — RNC DE CODEALARMA:
El RNC de CodeAlarm es: 130196036
Busca este número en TODA la factura: encabezado, pie de página, cuerpo, tablas, sellos, marcas de agua, "RNC cliente", "RNC comprador", cualquier campo numérico.
- Si encuentras 130196036 (con o sin guiones/espacios), confirma como "encontrado".
- Si NO encuentras ese número específico en ninguna parte, coloca null.
- NO confundas el RNC del suplidor con el de CodeAlarm.
- NO asumas ni inventes — solo confirma si lo ves claramente.

INSTRUCCIÓN CRÍTICA — MONEDA Y TASA DE CAMBIO:
- Detecta la moneda tal como aparece en la factura (DOP, RD$, USD, EUR, etc.).
- Normaliza siempre a código ISO: "DOP" para pesos dominicanos, "USD" para dólares, etc.
- Si la factura tiene una tasa de cambio explícita (ej: "Tasa: 62.00"), extráela en tasaCambio.
- Si la moneda es DOP o RD$, tasaCambio debe ser null.
- Los montos numéricos (subtotal, itbis, total) deben extraerse TAL COMO APARECEN en la factura, en la moneda original. La conversión a DOP se realiza externamente.

Extrae todos los datos en JSON con estas claves exactas:
{
  "fechaEmision": "fecha de emisión como aparece",
  "ncf": "Número de Comprobante Fiscal completo",
  "idFactura": "ID o número de factura",
  "suplidor": "nombre completo del suplidor/proveedor",
  "rncSuplidor": "RNC del suplidor/proveedor (solo dígitos)",
  "rncCodeAlarm": "si encuentras 130196036 en la factura escríbelo (solo dígitos), si no coloca null",
  "rncCodeAlarmUbicacion": "en qué parte de la factura aparece el RNC de CodeAlarm, o null",
  "moneda": "código ISO de la moneda (DOP, USD, EUR, etc.)",
  "tasaCambio": "tasa de cambio como string si aplica (ej: '62.00'), null si es DOP",
  "subtotal": número_decimal_o_null,
  "descuento": número_decimal_o_0,
  "itbis": número_decimal_o_null,
  "xLey": número_decimal_o_0,
  "total": número_decimal_o_null
}
Los campos numéricos deben ser números, no strings. Responde SOLO el JSON sin texto adicional, sin markdown, sin backticks.`;

  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message || `Error ${res.status}`);
  }

  const json   = await res.json();
  const raw    = json.choices[0].message.content;
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

  const rncIA  = (parsed.rncCodeAlarm || '').toString().replace(/\D/g, '');
  const rncRef = RNC_CODEALARMA.replace(/\D/g, '');

  return {
    ...parsed,
    subtotal:  parsed.subtotal  !== null ? Number(parsed.subtotal)  : null,
    descuento: parsed.descuento !== null ? Number(parsed.descuento) : 0,
    itbis:     parsed.itbis     !== null ? Number(parsed.itbis)     : null,
    xLey:      parsed.xLey      !== null ? Number(parsed.xLey)      : 0,
    total:     parsed.total     !== null ? Number(parsed.total)     : null,
    rncCodeAlarmConfirmado: !!rncIA && rncIA === rncRef,
    _type: 'factura' as const,
  };
}

// ─── Llamada a GPT-4o para COMPROBANTE ───────────────────────────────────────

export async function extractComprobanteWithAI(imageDataUrl: string): Promise<ComprobanteOCRData> {
  const base64 = imageDataUrl.split(',')[1];
  const mimeMatch = imageDataUrl.match(/data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const prompt = `Eres un extractor OCR preciso. Analiza este comprobante bancario/transferencia y extrae los datos en JSON exactamente con estas claves:
{
  "pagoa": "nombre completo de la persona o empresa a quien se realiza el pago",
  "monto": "monto exacto como aparece incluyendo símbolo de moneda (ej: RD$ 5,000.00)",
  "montoNumerico": número_decimal (solo el número sin símbolos),
  "fechaPago": "fecha de pago como aparece",
  "numeroCuenta": "número de cuenta destino",
  "nroReferencia": "número de referencia o transacción o comprobante",
  "descripcion": "descripción, concepto o motivo del pago"
}
Si algún campo no se encuentra, coloca null. Los campos numéricos deben ser números. Responde SOLO JSON sin texto extra, sin markdown, sin backticks.`;

  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message || `Error ${res.status}`);
  }

  const json   = await res.json();
  const raw    = json.choices[0].message.content;
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

  return {
    ...parsed,
    montoNumerico: parsed.montoNumerico !== null ? Number(parsed.montoNumerico) : null,
    _type: 'comprobante' as const,
  };
}

// ─── Utilidad de formato ──────────────────────────────────────────────────────

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(amount);
}