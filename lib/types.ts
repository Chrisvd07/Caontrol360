export type UserRole = 'tecnico' | 'pagos' | 'contabilidad' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
}

export type RequestStatus = 
  | 'enviada' 
  | 'aprobada' 
  | 'transferida' 
  | 'comprobante_subido'
  | 'factura_subida'
  | 'validada'
  | 'observada'
  | 'liquidada'
  | 'rechazada';

export type RequestType = 
  | 'combustible' 
  | 'materiales' 
  | 'viatico' 
  | 'gomera' 
  | 'otros';

export interface RequestItem {
  id: string;
  type: RequestType;
  description: string;
  amount: number;
  quantity?: number;
}

export interface OCRData {
  rnc?: string;
  ncf?: string;
  fecha?: string;
  subtotal?: number;
  itbis?: number;
  total?: number;
  proveedor?: string;
  rawText?: string;
}

export interface Evidence {
  id: string;
  type: 'comprobante' | 'factura' | 'qr' | 'foto';
  url: string;
  ocrData?: OCRData;
  uploadedAt: string;
  uploadedBy: string;
}

export interface Request {
  id: string;
  numero: string;
  userId: string;
  userName: string;
  type: RequestType;
  items: RequestItem[];
  totalAmount: number;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedAmount?: number;
  transferredAt?: string;
  transferredBy?: string;
  validatedAt?: string;
  validatedBy?: string;
  observations?: string[];
  evidences: Evidence[];
  delta?: number;
  liquidatedAt?: string;
  escalatedAt?: string;
  escalationLevel?: number;
  remindersSent?: number;
  lastReminderAt?: string;
}

export interface AuditLog {
  id: string;
  requestId: string;
  action: string;
  previousStatus?: RequestStatus;
  newStatus?: RequestStatus;
  userId: string;
  userName: string;
  timestamp: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface UserPreference {
  userId: string;
  type: RequestType;
  defaultAmount: number;
  label: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
  requestId?: string;
}

export interface SystemConfig {
  reminderIntervalHours: number;
  escalationThresholdHours: number;
  maxEscalationLevel: number;
  requireOCRConfirmation: boolean;
  allowVoiceInput: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: string;
  type?: 'text' | 'audio' | 'chip_selection';
  chips?: string[];
  audioUrl?: string;
}

export interface ExportData {
  requests: Request[];
  auditLogs: AuditLog[];
  evidences: Evidence[];
  generatedAt: string;
  generatedBy: string;
  dateRange?: {
    start: string;
    end: string;
  };
}

// Alias for backward compatibility
export type Solicitud = Request;

// Status enum for easier access
export const RequestStatusEnum = {
  ENVIADA: 'enviada' as RequestStatus,
  APROBADA: 'aprobada' as RequestStatus,
  TRANSFERIDA: 'transferida' as RequestStatus,
  COMPROBANTE_SUBIDO: 'comprobante_subido' as RequestStatus,
  FACTURA_SUBIDA: 'factura_subida' as RequestStatus,
  VALIDADA: 'validada' as RequestStatus,
  OBSERVADA: 'observada' as RequestStatus,
  LIQUIDADA: 'liquidada' as RequestStatus,
  RECHAZADA: 'rechazada' as RequestStatus,
};
