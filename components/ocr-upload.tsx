'use client';

/**
 * ocr-upload.tsx — versión con OCR + IA (GPT-4o Vision)
 *
 * FIX: Se guarda el File original (originalFile) y se pasa como _file
 * en el objeto Evidence para que el padre pueda subirlo a Cloudinary.
 * Antes solo se pasaba el base64 (imageUrl) y Cloudinary nunca se llamaba.
 */

import { useState, useRef, useCallback } from 'react';
import {
  Upload, Camera, FileText, ScanLine, RefreshCw,
  Check, X, AlertCircle, Image as ImageIcon, ShieldCheck, ShieldX, ShieldAlert,
} from 'lucide-react';
import {
  extractFacturaWithAI,
  extractComprobanteWithAI,
  validateFacturaData,
  validateComprobanteData,
  type FacturaOCRData,
  type ComprobanteOCRData,
} from '@/lib/ocr';
import type { Evidence } from '@/lib/types';
import { toast } from 'sonner';

// ─── Props ────────────────────────────────────────────────────────────────────

interface OCRUploadProps {
  /** 'factura' → solo para técnicos. 'comprobante' → solo para pagos */
  type: 'factura' | 'comprobante';
  onUpload:   (evidence: Evidence) => void;
  onCancel?:  () => void;
  title?:     string;
  description?: string;
  /**
   * Solo para comprobante: nombre del solicitante de la solicitud.
   * Se usa para validar que el comprobante coincida.
   */
  nombreSolicitante?: string;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface FacturaField {
  label:    string;
  val:      string | null | undefined;
  required: boolean;
  full?:    boolean;
  mono?:    boolean;
}

interface ComprobanteField {
  label:     string;
  val:       string | null | undefined;
  required:  boolean;
  full?:     boolean;
  mono?:     boolean;
  highlight?: boolean;
  ok?:       boolean;
}

// ─── Formateo de moneda ───────────────────────────────────────────────────────

function fmt(n: number | null | undefined, tasa = 1): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP', minimumFractionDigits: 2,
  }).format(n * tasa);
}

// ─── Helper: obtener tasa efectiva ───────────────────────────────────────────

function getTasa(data: FacturaOCRData): number {
  const esDOP = !data.moneda || data.moneda.toUpperCase() === 'DOP';
  if (esDOP) return 1;
  const tasa = parseFloat(data.tasaCambio ?? '');
  return isNaN(tasa) || tasa <= 0 ? 1 : tasa;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function OCRUpload({
  type,
  onUpload,
  onCancel,
  title,
  description,
  nombreSolicitante = '',
}: OCRUploadProps) {

  const [imageUrl,      setImageUrl]      = useState<string | null>(null);
  const [originalFile,  setOriginalFile]  = useState<File | null>(null); // ← FIX: guardar File original
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [isDragging,    setIsDragging]    = useState(false);

  // Resultados de extracción
  const [facturaData,     setFacturaData]     = useState<FacturaOCRData     | null>(null);
  const [comprobanteData, setComprobanteData] = useState<ComprobanteOCRData | null>(null);
  const [showConfirm,     setShowConfirm]     = useState(false);

  const fileRef   = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // ── Procesar archivo seleccionado ──────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Por favor selecciona una imagen (JPG, PNG) o PDF');
      return;
    }

    setOriginalFile(file); // ← FIX: guardar el File real antes de convertir

    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target?.result as string;
      setImageUrl(url);
      setIsProcessing(true);
      setShowConfirm(false);
      setFacturaData(null);
      setComprobanteData(null);

      try {
        if (type === 'factura') {
          const data = await extractFacturaWithAI(url);
          setFacturaData(data);
        } else {
          const data = await extractComprobanteWithAI(url);
          setComprobanteData(data);
        }
        setShowConfirm(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        toast.error('Error al procesar con IA: ' + message);
        setImageUrl(null);
        setOriginalFile(null); // ← FIX: limpiar si falla
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  }, [type]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── Confirmar y pasar la evidencia al padre ────────────────────────────────
  const handleConfirm = () => {
    if (!imageUrl) return;

    if (type === 'factura' && facturaData) {
      const validation = validateFacturaData(facturaData);
      if (!validation.valid) {
        toast.error('Completa todos los campos antes de confirmar');
        return;
      }

      const tasa = getTasa(facturaData);

      onUpload({
        id: `ev-${Date.now()}`,
        type: 'factura',
        url: imageUrl,
        _file: originalFile ?? undefined, // ← FIX: pasar el File para que el padre suba a Cloudinary
        ocrData: {
          proveedor: facturaData.suplidor ?? undefined,
          fecha:     facturaData.fechaEmision ?? undefined,
          rnc:       facturaData.rncSuplidor ?? undefined,
          ncf:       facturaData.ncf ?? undefined,
          subtotal:  facturaData.subtotal != null ? facturaData.subtotal * tasa : undefined,
          itbis:     facturaData.itbis    != null ? facturaData.itbis    * tasa : undefined,
          total:     facturaData.total    != null ? facturaData.total    * tasa : undefined,
          rawText:   JSON.stringify({
            ...facturaData,
            monedaOriginal: facturaData.moneda,
            tasaAplicada:   tasa,
          }),
        },
        uploadedAt: new Date().toISOString(),
        uploadedBy: '',
      } as any);
      setShowConfirm(false);
      toast.success('Factura procesada y confirmada');
    }

    if (type === 'comprobante' && comprobanteData) {
      const validation = validateComprobanteData(comprobanteData, nombreSolicitante);
      if (!validation.valid) {
        toast.error('No se puede confirmar: ' + validation.errors[0]);
        return;
      }
      onUpload({
        id: `ev-${Date.now()}`,
        type: 'comprobante',
        url: imageUrl,
        _file: originalFile ?? undefined, // ← FIX: pasar el File para que el padre suba a Cloudinary
        ocrData: {
          proveedor: comprobanteData.pagoa ?? undefined,
          fecha:     comprobanteData.fechaPago ?? undefined,
          total:     comprobanteData.montoNumerico ?? undefined,
          rawText:   JSON.stringify(comprobanteData),
        },
        uploadedAt: new Date().toISOString(),
        uploadedBy: '',
      } as any);
      setShowConfirm(false);
      toast.success('Comprobante procesado y confirmado');
    }
  };

  // ← FIX: limpiar originalFile en retry también
  const handleRetry = () => {
    setImageUrl(null);
    setOriginalFile(null);
    setFacturaData(null);
    setComprobanteData(null);
    setShowConfirm(false);
  };

  // ── Vista: pantalla de confirmación FACTURA ────────────────────────────────
  if (showConfirm && type === 'factura' && facturaData) {
    const validation = validateFacturaData(facturaData);
    const { rncCodeAlarmStatus } = validation;

    const tasa = getTasa(facturaData);
    const esDOP = tasa === 1;

    const facturaFields: FacturaField[] = [
      { label: 'Fecha Emisión', val: facturaData.fechaEmision, required: true },
      { label: 'NCF',           val: facturaData.ncf,          required: true, mono: true },
      { label: 'ID Factura',    val: facturaData.idFactura,    required: true },
      { label: 'Suplidor',      val: facturaData.suplidor,     required: true, full: true },
      { label: 'RNC Suplidor',  val: facturaData.rncSuplidor,  required: true, mono: true },
      {
        label: 'Monto Original',
        val: facturaData.total != null && facturaData.moneda
          ? `${facturaData.total} ${facturaData.moneda.toUpperCase()}`
          : facturaData.moneda ?? null,
        required: false,
      },
      ...(!esDOP
        ? [{ label: 'Tasa de Cambio', val: facturaData.tasaCambio, required: false }]
        : []),
    ];

    return (
      <>
        <style>{OCR_STYLES}</style>
        <div className="ocr-card">
          <div className="ocr-topbar" />
          <div className="ocr-hd">
            <div className="ocr-hd-ico"><ScanLine size={15} /></div>
            <div>
              <div className="ocr-hd-title">Datos Extraídos — Factura</div>
              <div className="ocr-hd-sub">Verifica todos los datos antes de confirmar</div>
            </div>
          </div>

          {validation.errors.length > 0 && (
            <div className="ocr-warn error">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div className="ocr-warn-title">Campos incompletos — no se puede confirmar</div>
                {validation.errors.map((e: string, i: number) => (
                  <div key={i} className="ocr-warn-item">· {e}</div>
                ))}
              </div>
            </div>
          )}

          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <div className="ocr-warn">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div className="ocr-warn-title">Advertencias</div>
                {validation.warnings.map((w: string, i: number) => (
                  <div key={i} className="ocr-warn-item">· {w}</div>
                ))}
              </div>
            </div>
          )}

          <div className="ocr-grid">
            {facturaFields.map((f: FacturaField, i: number) => (
              <div key={i} className={`ocr-field ${f.full ? 'full' : ''}`}>
                <span className="ocr-field-lbl">
                  {f.label}
                  {f.required && <span className="ocr-req">*</span>}
                </span>
                <span className={`ocr-field-val ${f.mono ? 'mono' : ''} ${!f.val ? 'empty error-val' : ''}`}>
                  {f.val || '⚠ No detectado'}
                </span>
              </div>
            ))}
          </div>

          <div className="ocr-totals">
            {!esDOP && (
              <div className="ocr-conversion-badge">
                <span>Convertido a DOP</span>
                <span className="ocr-conversion-rate">
                  {facturaData.moneda?.toUpperCase()} × {tasa} = DOP
                </span>
              </div>
            )}
            <div className="ocr-total-row">
              <span>Subtotal</span>
              <span className={!facturaData.subtotal ? 'missing' : ''}>{fmt(facturaData.subtotal, tasa)}</span>
            </div>
            <div className="ocr-total-row">
              <span>Descuento</span>
              <span>{fmt(facturaData.descuento ?? 0, tasa)}</span>
            </div>
            <div className="ocr-total-row">
              <span>ITBIS</span>
              <span className={!facturaData.itbis ? 'missing' : ''}>{fmt(facturaData.itbis, tasa)}</span>
            </div>
            {(facturaData.xLey ?? 0) > 0 && (
              <div className="ocr-total-row">
                <span>X Ley</span>
                <span>{fmt(facturaData.xLey, tasa)}</span>
              </div>
            )}
            <div className="ocr-total-row main">
              <span>Total</span>
              <span className={`ocr-total-amount ${!facturaData.total ? 'missing' : ''}`}>
                {fmt(facturaData.total, tasa)}
              </span>
            </div>
          </div>

          <div className={`ocr-rnc-box ${rncCodeAlarmStatus}`}>
            {rncCodeAlarmStatus === 'confirmado' && (
              <>
                <ShieldCheck size={16} style={{ color: '#00ff88', flexShrink: 0 }} />
                <div>
                  <div className="ocr-rnc-title" style={{ color: '#00ff88' }}>RNC CodeAlarm confirmado</div>
                  <div className="ocr-rnc-sub">{facturaData.rncCodeAlarm} · {facturaData.rncCodeAlarmUbicacion}</div>
                </div>
              </>
            )}
            {rncCodeAlarmStatus === 'no_encontrado' && (
              <>
                <ShieldX size={16} style={{ color: '#ffd32a', flexShrink: 0 }} />
                <div>
                  <div className="ocr-rnc-title" style={{ color: '#ffd32a' }}>RNC CodeAlarm no encontrado</div>
                  <div className="ocr-rnc-sub">
                    No se detectó el RNC 130196036 en esta factura. Verifica manualmente.
                  </div>
                </div>
              </>
            )}
            {rncCodeAlarmStatus === 'no_coincide' && (
              <>
                <ShieldAlert size={16} style={{ color: '#ff4757', flexShrink: 0 }} />
                <div>
                  <div className="ocr-rnc-title" style={{ color: '#ff4757' }}>RNC no coincide</div>
                  <div className="ocr-rnc-sub">
                    Se detectó {facturaData.rncCodeAlarm} pero no coincide con 130196036.
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="ocr-actions">
            <button className="ocr-btn secondary" onClick={handleRetry}>
              <RefreshCw size={14} /> Reintentar
            </button>
            <button
              className="ocr-btn primary"
              onClick={handleConfirm}
              disabled={!validation.valid}
              title={!validation.valid ? 'Completa todos los campos requeridos' : ''}
            >
              <Check size={14} /> Confirmar
            </button>
          </div>

          {onCancel && (
            <button className="ocr-cancel" onClick={onCancel}>Cancelar</button>
          )}
        </div>
      </>
    );
  }

  // ── Vista: pantalla de confirmación COMPROBANTE ────────────────────────────
  if (showConfirm && type === 'comprobante' && comprobanteData) {
    const validation = validateComprobanteData(comprobanteData, nombreSolicitante);

    const comprobanteFields: ComprobanteField[] = [
      {
        label: 'Pago A (Beneficiario)', val: comprobanteData.pagoa, required: true, full: true,
        highlight: !!comprobanteData.pagoa && !!nombreSolicitante,
        ok: validation.nombreCoincide,
      },
      { label: 'Monto',            val: comprobanteData.monto,         required: true },
      { label: 'Fecha de Pago',    val: comprobanteData.fechaPago,     required: true },
      { label: 'Número de Cuenta', val: comprobanteData.numeroCuenta,  required: true },
      { label: 'Nº Referencia',    val: comprobanteData.nroReferencia, required: true, mono: true },
      { label: 'Descripción',      val: comprobanteData.descripcion,   required: true, full: true },
    ];

    return (
      <>
        <style>{OCR_STYLES}</style>
        <div className="ocr-card">
          <div className="ocr-topbar" />
          <div className="ocr-hd">
            <div className="ocr-hd-ico"><ScanLine size={15} /></div>
            <div>
              <div className="ocr-hd-title">Datos Extraídos — Comprobante</div>
              <div className="ocr-hd-sub">Verifica todos los datos antes de confirmar</div>
            </div>
          </div>

          {validation.errors.length > 0 && (
            <div className="ocr-warn error">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div className="ocr-warn-title">Problemas detectados — no se puede confirmar</div>
                {validation.errors.map((e: string, i: number) => (
                  <div key={i} className="ocr-warn-item">· {e}</div>
                ))}
              </div>
            </div>
          )}

          <div className="ocr-grid">
            {comprobanteFields.map((f: ComprobanteField, i: number) => (
              <div
                key={i}
                className={`ocr-field ${f.full ? 'full' : ''} ${f.highlight && !f.ok ? 'field-mismatch' : ''}`}
              >
                <span className="ocr-field-lbl">
                  {f.label}
                  {f.required && <span className="ocr-req">*</span>}
                  {f.highlight && f.ok  && <span className="ocr-match-ok">✓ coincide</span>}
                  {f.highlight && !f.ok && f.val && <span className="ocr-match-fail">✗ no coincide</span>}
                </span>
                <span className={`ocr-field-val ${f.mono ? 'mono' : ''} ${!f.val ? 'empty error-val' : ''}`}>
                  {f.val || '⚠ No detectado'}
                </span>
                {f.highlight && nombreSolicitante && (
                  <span className="ocr-field-expected">Esperado: {nombreSolicitante}</span>
                )}
              </div>
            ))}
          </div>

          {comprobanteData.montoNumerico && (
            <div className="ocr-totals">
              <div className="ocr-total-row main">
                <span>Monto Total</span>
                <span className="ocr-total-amount">{fmt(comprobanteData.montoNumerico)}</span>
              </div>
            </div>
          )}

          <div className="ocr-actions">
            <button className="ocr-btn secondary" onClick={handleRetry}>
              <RefreshCw size={14} /> Reintentar
            </button>
            <button
              className="ocr-btn primary"
              onClick={handleConfirm}
              disabled={!validation.valid}
              title={!validation.valid ? validation.errors[0] : ''}
            >
              <Check size={14} /> Confirmar
            </button>
          </div>

          {onCancel && (
            <button className="ocr-cancel" onClick={onCancel}>Cancelar</button>
          )}
        </div>
      </>
    );
  }

  // ── Vista: pantalla de subida ──────────────────────────────────────────────
  const META = {
    factura:     { title: 'Subir Factura Fiscal',       desc: 'Extracción automática con IA · GPT-4o Vision', icon: <FileText size={18} /> },
    comprobante: { title: 'Subir Comprobante Bancario', desc: 'Extracción automática con IA · GPT-4o Vision', icon: <FileText size={18} /> },
  };
  const meta = META[type];

  return (
    <>
      <style>{OCR_STYLES}</style>
      <div className="ocr-card">
        <div className="ocr-topbar" />
        <div className="ocr-hd">
          <div className="ocr-hd-ico">{meta.icon}</div>
          <div>
            <div className="ocr-hd-title">{title || meta.title}</div>
            <div className="ocr-hd-sub">{description || meta.desc}</div>
          </div>
        </div>

        <div
          className={`ocr-drop ${isDragging ? 'drag' : ''} ${isProcessing ? 'processing' : ''} ${imageUrl && !isProcessing ? 'has-img' : ''}`}
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => !isProcessing && fileRef.current?.click()}
        >
          {isProcessing ? (
            <div className="ocr-processing">
              <div className="ocr-scan-wrap">
                <div className="ocr-scan-ring" />
                <ScanLine size={26} style={{ color: '#c9a84c', animation: 'ocr-pulse 1.2s ease-in-out infinite' }} />
              </div>
              <div className="ocr-processing-title">Analizando con IA…</div>
              <div className="ocr-processing-sub">GPT-4o Vision extrayendo datos</div>
            </div>
          ) : imageUrl ? (
            <div className="ocr-preview">
              <img src={imageUrl} alt="Preview" className="ocr-preview-img" />
              <div className="ocr-preview-label">Imagen cargada · haz clic para cambiar</div>
            </div>
          ) : (
            <div className="ocr-empty-drop">
              <div className="ocr-drop-ico">
                <Upload size={22} style={{ color: '#c9a84c' }} />
              </div>
              <div className="ocr-drop-title">Arrastra una imagen aquí</div>
              <div className="ocr-drop-sub">o usa los botones de abajo</div>
              <div className="ocr-drop-formats">JPG · PNG · WEBP</div>
            </div>
          )}
        </div>

        <div className="ocr-btns">
          <input
            ref={fileRef} type="file" accept="image/*"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
          />
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }}
            onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
          />
          <button className="ocr-btn secondary" disabled={isProcessing} onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}>
            <ImageIcon size={14} /> Galería
          </button>
          <button className="ocr-btn secondary" disabled={isProcessing} onClick={e => { e.stopPropagation(); cameraRef.current?.click(); }}>
            <Camera size={14} /> Cámara
          </button>
        </div>

        {onCancel && (
          <button className="ocr-cancel" onClick={onCancel}>Cancelar</button>
        )}
      </div>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const OCR_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

  .ocr-card {
    font-family: 'Outfit', sans-serif;
    background: #141820; border: 1px solid rgba(244,241,234,0.08);
    border-radius: 16px; overflow: hidden;
    --gold: #c9a84c; --gold2: #e2bd6a;
    --gold-dim: rgba(201,168,76,0.10); --gold-border: rgba(201,168,76,0.28);
    --w: #f4f1ea; --w70: rgba(244,241,234,0.70); --w40: rgba(244,241,234,0.40);
    --w20: rgba(244,241,234,0.20); --w08: rgba(244,241,234,0.08);
    --red: #ff4757; --green: #00ff88; --yellow: #ffd32a;
  }
  .ocr-topbar { height:2px; background:linear-gradient(90deg,transparent,var(--gold),var(--gold2),transparent); opacity:.45; }

  .ocr-hd {
    display: flex; align-items: flex-start; gap: .75rem;
    padding: .875rem 1.1rem; border-bottom: 1px solid var(--w08);
  }
  .ocr-hd-ico {
    width: 34px; height: 34px; border-radius: 8px; flex-shrink:0;
    background: var(--gold-dim); border: 1px solid var(--gold-border);
    display:flex; align-items:center; justify-content:center; color:var(--gold);
  }
  .ocr-hd-title { font-size:.875rem; font-weight:600; color:var(--w); }
  .ocr-hd-sub   { font-size:.72rem; color:var(--w40); margin-top:.15rem; font-weight:300; }

  .ocr-drop {
    margin: .875rem; border-radius: 12px;
    border: 1.5px dashed rgba(244,241,234,0.12);
    padding: 1.75rem 1rem; text-align:center; cursor:pointer;
    transition: border-color .2s, background .2s;
  }
  .ocr-drop.drag    { border-color: var(--gold-border); background: var(--gold-dim); }
  .ocr-drop.has-img { border-color: rgba(201,168,76,0.3); background: var(--gold-dim); }

  .ocr-processing { display:flex; flex-direction:column; align-items:center; gap:.75rem; }
  .ocr-scan-wrap { position:relative; width:56px; height:56px; display:flex; align-items:center; justify-content:center; }
  .ocr-scan-ring {
    position:absolute; inset:0; border-radius:50%;
    border:2px solid rgba(201,168,76,0.15); border-top-color:var(--gold);
    animation: ocr-spin .8s linear infinite;
  }
  @keyframes ocr-spin { to{transform:rotate(360deg)} }
  @keyframes ocr-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
  .ocr-processing-title { font-size:.875rem; font-weight:600; color:var(--w); }
  .ocr-processing-sub   { font-size:.72rem; color:var(--w40); }

  .ocr-preview { display:flex; flex-direction:column; align-items:center; gap:.6rem; }
  .ocr-preview-img { max-height:160px; border-radius:10px; object-fit:contain; border:1px solid var(--w08); }
  .ocr-preview-label { font-size:.68rem; color:var(--w40); }

  .ocr-empty-drop { display:flex; flex-direction:column; align-items:center; gap:.5rem; }
  .ocr-drop-ico {
    width:48px; height:48px; border-radius:12px;
    background: var(--gold-dim); border:1px solid var(--gold-border);
    display:flex; align-items:center; justify-content:center; margin-bottom:.2rem;
  }
  .ocr-drop-title  { font-size:.875rem; font-weight:500; color:var(--w70); }
  .ocr-drop-sub    { font-size:.75rem; color:var(--w40); font-weight:300; }
  .ocr-drop-formats { font-size:.62rem; color:var(--w20); letter-spacing:.08em; margin-top:.2rem; }

  .ocr-btns { display:flex; gap:.6rem; padding:0 .875rem .875rem; }
  .ocr-btn {
    flex:1; border-radius:10px; padding:.7rem 1rem;
    font-family:'Outfit',sans-serif; font-size:.8rem; font-weight:600;
    display:flex; align-items:center; justify-content:center; gap:.4rem;
    cursor:pointer; transition:all .2s cubic-bezier(.22,1,.36,1);
  }
  .ocr-btn.primary {
    background:linear-gradient(135deg,#c9a84c,#9a7018); color:#06040a; border:none;
    box-shadow:0 4px 16px rgba(201,168,76,0.28);
  }
  .ocr-btn.primary:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
  .ocr-btn.primary:disabled { opacity:.35; cursor:not-allowed; }
  .ocr-btn.secondary {
    background:rgba(20,24,32,0.8); border:1px solid var(--w08); color:var(--w40);
  }
  .ocr-btn.secondary:not(:disabled):hover { border-color:var(--gold-border); color:var(--gold); background:var(--gold-dim); }
  .ocr-btn:disabled { opacity:.4; cursor:not-allowed; transform:none; }

  .ocr-cancel {
    display:block; width:calc(100% - 1.75rem); margin:0 .875rem .875rem;
    background:none; border:none; font-size:.78rem; color:var(--w20);
    cursor:pointer; font-family:'Outfit',sans-serif; padding:.4rem; transition:color .15s;
  }
  .ocr-cancel:hover { color:var(--w40); }

  .ocr-warn {
    margin:.875rem .875rem 0; padding:.75rem 1rem;
    background:rgba(249,115,22,0.08); border:1px solid rgba(249,115,22,0.2);
    border-radius:10px; display:flex; gap:.6rem; font-size:.75rem;
  }
  .ocr-warn.error {
    background:rgba(255,71,87,0.08); border-color:rgba(255,71,87,0.28);
  }
  .ocr-warn-title { font-weight:600; color:#f97316; margin-bottom:.2rem; }
  .ocr-warn.error .ocr-warn-title { color:var(--red); }
  .ocr-warn-item  { color:rgba(249,115,22,0.75); }
  .ocr-warn.error .ocr-warn-item { color:rgba(255,71,87,0.8); }

  .ocr-grid { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; padding:.875rem .875rem 0; }
  .ocr-field {
    background:rgba(26,32,48,0.6); border:1px solid var(--w08);
    border-radius:8px; padding:.65rem .75rem; position:relative;
  }
  .ocr-field.full { grid-column: 1 / -1; }
  .ocr-field.field-mismatch { border-color:rgba(255,71,87,0.35); background:rgba(255,71,87,0.06); }

  .ocr-field-lbl {
    font-size:.62rem; font-weight:600; letter-spacing:.08em;
    text-transform:uppercase; color:var(--w20); display:block; margin-bottom:.25rem;
    display:flex; align-items:center; gap:.35rem; flex-wrap:wrap;
  }
  .ocr-req   { color:#ff4757; font-size:.7rem; }
  .ocr-match-ok   { color:#00ff88; font-size:.6rem; font-weight:700; letter-spacing:.05em; }
  .ocr-match-fail { color:#ff4757; font-size:.6rem; font-weight:700; letter-spacing:.05em; }

  .ocr-field-val         { font-size:.78rem; color:var(--w70); font-weight:500; display:block; }
  .ocr-field-val.mono    { font-family:monospace; font-size:.72rem; }
  .ocr-field-val.empty   { color:var(--w20); font-style:italic; font-weight:300; }
  .ocr-field-val.error-val { color:#ff4757; font-style:normal; }

  .ocr-field-expected {
    display:block; font-size:.62rem; color:var(--w20);
    margin-top:.2rem; font-style:italic;
  }

  .ocr-totals {
    margin:.75rem .875rem 0; padding:.875rem 1rem;
    background:var(--gold-dim); border:1px solid var(--gold-border); border-radius:10px;
  }
  .ocr-total-row {
    display:flex; justify-content:space-between; align-items:center;
    padding:.25rem 0; font-size:.8rem; color:var(--w40);
  }
  .ocr-total-row.main {
    border-top:1px solid rgba(201,168,76,0.2); margin-top:.35rem;
    padding-top:.6rem; color:var(--w); font-weight:600; font-size:.875rem;
  }
  .ocr-total-row .missing { color:#ffd32a; }
  .ocr-total-amount       { font-size:1.15rem; font-weight:700; color:var(--gold2); }
  .ocr-total-amount.missing { color:#ffd32a; }

  .ocr-conversion-badge {
    display:flex; justify-content:space-between; align-items:center;
    padding:.3rem .5rem; margin-bottom:.4rem;
    background:rgba(201,168,76,0.08); border:1px solid rgba(201,168,76,0.2);
    border-radius:6px; font-size:.68rem; color:rgba(201,168,76,0.7);
  }
  .ocr-conversion-rate {
    font-weight:600; color:var(--gold); font-family:monospace; font-size:.7rem;
  }

  .ocr-rnc-box {
    margin:.75rem .875rem 0; padding:.75rem 1rem;
    border-radius:10px; display:flex; gap:.65rem; align-items:flex-start;
    font-size:.75rem;
  }
  .ocr-rnc-box.confirmado    { background:rgba(0,255,136,0.07); border:1px solid rgba(0,255,136,0.25); }
  .ocr-rnc-box.no_encontrado { background:rgba(255,211,42,0.07); border:1px solid rgba(255,211,42,0.25); }
  .ocr-rnc-box.no_coincide   { background:rgba(255,71,87,0.07); border:1px solid rgba(255,71,87,0.25); }
  .ocr-rnc-title { font-weight:600; margin-bottom:.15rem; }
  .ocr-rnc-sub   { color:var(--w40); font-size:.7rem; line-height:1.4; }

  .ocr-actions { display:flex; gap:.6rem; padding:.875rem; }
`;