"use client"

import type { Request, AuditLog } from './types'
import * as storageModule from './storage'

// Generate CSV from data
export function generateCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header]
        if (value === null || value === undefined) return ''
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return String(value)
      }).join(',')
    )
  ].join('\n')

  downloadFile(csvContent, `${filename}.csv`, 'text/csv')
}

// Generate JSON export
export function generateJSON(data: unknown, filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2)
  downloadFile(jsonContent, `${filename}.json`, 'application/json')
}

// Download file helper
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Export requests with evidence
export function exportRequestsWithEvidence(
  requests: Request[],
  format: 'csv' | 'json' = 'csv'
): void {
  const exportData = requests.map(r => ({
    id: r.id,
    numero: r.numero,
    tecnico: r.userName,
    tipo: r.type,
    monto_solicitado: r.totalAmount,
    monto_aprobado: r.approvedAmount || '',
    delta: r.delta || '',
    estado: r.status,
    fecha_creacion: new Date(r.createdAt).toLocaleString('es-DO'),
    fecha_actualizacion: new Date(r.updatedAt).toLocaleString('es-DO'),
    tiene_comprobante: r.evidences.some(e => e.type === 'comprobante') ? 'Si' : 'No',
    tiene_factura: r.evidences.some(e => e.type === 'factura') ? 'Si' : 'No',
    ncf: r.evidences.find(e => e.type === 'factura')?.ocrData?.ncf || '',
    rnc: r.evidences.find(e => e.type === 'factura')?.ocrData?.rnc || '',
    observaciones: r.observations?.join('; ') || ''
  }))

  const timestamp = new Date().toISOString().split('T')[0]
  
  if (format === 'csv') {
    generateCSV(exportData, `solicitudes_${timestamp}`)
  } else {
    generateJSON(exportData, `solicitudes_${timestamp}`)
  }
}

// Alias for backward compatibility
export const exportSolicitudesWithEvidence = exportRequestsWithEvidence

// Export full report with all data
export function exportFullReport(): void {
  const requests = storageModule.getRequests()
  const auditLogs = storageModule.getAuditLogs()
  const config = storageModule.getConfig()

  const statuses = ['enviada', 'aprobada', 'transferida', 'comprobante_subido', 'factura_subida', 'validada', 'observada', 'liquidada', 'rechazada']

  const report = {
    generatedAt: new Date().toISOString(),
    config,
    statistics: {
      totalRequests: requests.length,
      byStatus: statuses.reduce((acc, status) => {
        acc[status] = requests.filter(r => r.status === status).length
        return acc
      }, {} as Record<string, number>),
      totalAmountRequested: requests.reduce((sum, r) => sum + r.totalAmount, 0),
      totalAmountApproved: requests.reduce((sum, r) => sum + (r.approvedAmount || 0), 0),
      totalDelta: requests.reduce((sum, r) => sum + (r.delta || 0), 0)
    },
    requests: requests.map(r => ({
      ...r,
      evidences: r.evidences.map(e => ({
        ...e,
        url: '[EVIDENCE_URL]'
      }))
    })),
    auditLogs
  }

  const timestamp = new Date().toISOString().split('T')[0]
  generateJSON(report, `reporte_completo_${timestamp}`)
}

// Export audit logs
export function exportAuditLogs(logs: AuditLog[]): void {
  const exportData = logs.map(log => ({
    id: log.id,
    solicitud_id: log.requestId,
    accion: log.action,
    usuario: log.userName,
    detalles: log.details || '',
    estado_anterior: log.previousStatus || '',
    estado_nuevo: log.newStatus || '',
    fecha: new Date(log.timestamp).toLocaleString('es-DO')
  }))

  const timestamp = new Date().toISOString().split('T')[0]
  generateCSV(exportData, `audit_log_${timestamp}`)
}

// Generate printable report
export function generatePrintableReport(request: Request): string {
  const comprobante = request.evidences.find(e => e.type === 'comprobante')
  const factura = request.evidences.find(e => e.type === 'factura')
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Solicitud ${request.numero}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .section { margin-bottom: 20px; }
    .section-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; }
    .row { display: flex; margin-bottom: 8px; }
    .label { width: 200px; font-weight: bold; }
    .value { flex: 1; }
    .evidence { max-width: 400px; margin-top: 10px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>GastoFlow - Reporte de Solicitud</h1>
    <p>No: ${request.numero}</p>
  </div>
  
  <div class="section">
    <div class="section-title">Informacion General</div>
    <div class="row"><span class="label">Tecnico:</span><span class="value">${request.userName}</span></div>
    <div class="row"><span class="label">Tipo:</span><span class="value">${request.type}</span></div>
    <div class="row"><span class="label">Estado:</span><span class="value">${request.status}</span></div>
    <div class="row"><span class="label">Fecha Creacion:</span><span class="value">${new Date(request.createdAt).toLocaleString('es-DO')}</span></div>
  </div>
  
  <div class="section">
    <div class="section-title">Montos</div>
    <div class="row"><span class="label">Monto Solicitado:</span><span class="value">RD$ ${request.totalAmount.toLocaleString('es-DO')}</span></div>
    ${request.approvedAmount ? `<div class="row"><span class="label">Monto Aprobado:</span><span class="value">RD$ ${request.approvedAmount.toLocaleString('es-DO')}</span></div>` : ''}
    ${request.delta ? `<div class="row"><span class="label">Delta:</span><span class="value">RD$ ${request.delta.toLocaleString('es-DO')}</span></div>` : ''}
  </div>
  
  ${comprobante ? `
  <div class="section">
    <div class="section-title">Comprobante de Pago</div>
    <div class="row"><span class="label">Fecha:</span><span class="value">${comprobante.uploadedAt}</span></div>
  </div>
  ` : ''}
  
  ${factura ? `
  <div class="section">
    <div class="section-title">Factura</div>
    <div class="row"><span class="label">NCF:</span><span class="value">${factura.ocrData?.ncf || 'N/A'}</span></div>
    <div class="row"><span class="label">RNC:</span><span class="value">${factura.ocrData?.rnc || 'N/A'}</span></div>
    <div class="row"><span class="label">Total:</span><span class="value">RD$ ${factura.ocrData?.total?.toLocaleString('es-DO') || 'N/A'}</span></div>
  </div>
  ` : ''}
  
  ${request.observations && request.observations.length > 0 ? `
  <div class="section">
    <div class="section-title">Observaciones</div>
    ${request.observations.map(obs => `<p>- ${obs}</p>`).join('')}
  </div>
  ` : ''}
  
  <div class="section" style="margin-top: 40px; text-align: center; color: #666;">
    <p>Generado: ${new Date().toLocaleString('es-DO')}</p>
  </div>
</body>
</html>
  `
}

// Print report
export function printReport(request: Request): void {
  const html = generatePrintableReport(request)
  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.print()
  }
}
