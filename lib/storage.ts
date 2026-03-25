import type { 
  User, 
  Request, 
  AuditLog, 
  UserPreference, 
  Notification,
  SystemConfig,
  RequestStatus,
  Evidence,
  Solicitud
} from './types';

const STORAGE_KEYS = {
  USERS: 'gastoflow_users',
  CURRENT_USER: 'gastoflow_current_user',
  REQUESTS: 'gastoflow_requests',
  AUDIT_LOGS: 'gastoflow_audit_logs',
  PREFERENCES: 'gastoflow_preferences',
  NOTIFICATIONS: 'gastoflow_notifications',
  CONFIG: 'gastoflow_config',
  REQUEST_COUNTER: 'gastoflow_request_counter'
} as const;

// Default users for each role
const DEFAULT_USERS: User[] = [
  {
    id: 'user-tecnico-1',
    name: 'Juan Perez',
    email: 'tecnico@gastoflow.com',
    role: 'tecnico',
    createdAt: new Date().toISOString()
  },
  {
    id: 'user-pagos-1',
    name: 'Maria Garcia',
    email: 'pagos@gastoflow.com',
    role: 'pagos',
    createdAt: new Date().toISOString()
  },
  {
    id: 'user-contabilidad-1',
    name: 'Carlos Rodriguez',
    email: 'contabilidad@gastoflow.com',
    role: 'contabilidad',
    createdAt: new Date().toISOString()
  },
  {
    id: 'user-admin-1',
    name: 'Ana Martinez',
    email: 'admin@gastoflow.com',
    role: 'admin',
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_PREFERENCES: UserPreference[] = [
  { userId: 'user-tecnico-1', type: 'combustible', defaultAmount: 2000, label: 'Combustible semanal' },
  { userId: 'user-tecnico-1', type: 'viatico', defaultAmount: 1500, label: 'Viatico diario' },
  { userId: 'user-tecnico-1', type: 'materiales', defaultAmount: 5000, label: 'Materiales varios' }
];

const DEFAULT_CONFIG: SystemConfig = {
  reminderIntervalHours: 24,
  escalationThresholdHours: 48,
  maxEscalationLevel: 3,
  requireOCRConfirmation: true,
  allowVoiceInput: true
};

function getItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

// Initialize storage with default data
export function initializeStorage(): void {
  const existingUsers = getItem<User[]>(STORAGE_KEYS.USERS, []);
  if (existingUsers.length === 0) {
    setItem(STORAGE_KEYS.USERS, DEFAULT_USERS);
    setItem(STORAGE_KEYS.PREFERENCES, DEFAULT_PREFERENCES);
    setItem(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
    setItem(STORAGE_KEYS.REQUESTS, []);
    setItem(STORAGE_KEYS.AUDIT_LOGS, []);
    setItem(STORAGE_KEYS.NOTIFICATIONS, []);
    setItem(STORAGE_KEYS.REQUEST_COUNTER, 1);
  }
}

// User functions
export function getUsers(): User[] {
  return getItem<User[]>(STORAGE_KEYS.USERS, DEFAULT_USERS);
}

export function getCurrentUser(): User | null {
  return getItem<User | null>(STORAGE_KEYS.CURRENT_USER, null);
}

export function setCurrentUser(user: User | null): void {
  setItem(STORAGE_KEYS.CURRENT_USER, user);
}

export function login(email: string, password: string): User | null {
  const users = getUsers();
  // Simple password check: password is the role name
  const user = users.find(u => u.email === email);
  if (user && password === user.role) {
    setCurrentUser(user);
    return user;
  }
  return null;
}

export function logout(): void {
  setCurrentUser(null);
}

// Request functions
export function getRequests(): Request[] {
  return getItem<Request[]>(STORAGE_KEYS.REQUESTS, []);
}

export function getRequestsByUser(userId: string): Request[] {
  return getRequests().filter(r => r.userId === userId);
}

export function getRequestsByStatus(statuses: RequestStatus[]): Request[] {
  return getRequests().filter(r => statuses.includes(r.status));
}

export function getRequestById(id: string): Request | null {
  return getRequests().find(r => r.id === id) || null;
}

export function generateRequestNumber(): string {
  const counter = getItem<number>(STORAGE_KEYS.REQUEST_COUNTER, 1);
  setItem(STORAGE_KEYS.REQUEST_COUNTER, counter + 1);
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `SOL-${year}${month}-${counter.toString().padStart(4, '0')}`;
}

export function createRequest(request: Omit<Request, 'id' | 'numero' | 'createdAt' | 'updatedAt'>): Request {
  const requests = getRequests();
  const newRequest: Request = {
    ...request,
    id: `req-${Date.now()}`,
    numero: generateRequestNumber(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  requests.push(newRequest);
  setItem(STORAGE_KEYS.REQUESTS, requests);
  
  // Create audit log
  createAuditLog({
    requestId: newRequest.id,
    action: 'SOLICITUD_CREADA',
    newStatus: 'enviada',
    userId: request.userId,
    userName: request.userName,
    details: `Solicitud ${newRequest.numero} creada por RD$${request.totalAmount}`
  });
  
  return newRequest;
}

export function updateRequest(id: string, updates: Partial<Request>, userId: string, userName: string): Request | null {
  const requests = getRequests();
  const index = requests.findIndex(r => r.id === id);
  if (index === -1) return null;
  
  const previousStatus = requests[index].status;
  const updatedRequest = {
    ...requests[index],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  requests[index] = updatedRequest;
  setItem(STORAGE_KEYS.REQUESTS, requests);
  
  // Create audit log if status changed
  if (updates.status && updates.status !== previousStatus) {
    createAuditLog({
      requestId: id,
      action: `ESTADO_CAMBIADO`,
      previousStatus,
      newStatus: updates.status,
      userId,
      userName,
      details: updates.observations?.length 
        ? `Observacion: ${updates.observations[updates.observations.length - 1]}`
        : undefined
    });
  }
  
  return updatedRequest;
}

export function addEvidenceToRequest(requestId: string, evidence: Evidence, userId: string, userName: string): Request | null {
  const requests = getRequests();
  const index = requests.findIndex(r => r.id === requestId);
  if (index === -1) return null;
  
  requests[index].evidences.push(evidence);
  requests[index].updatedAt = new Date().toISOString();
  setItem(STORAGE_KEYS.REQUESTS, requests);
  
  createAuditLog({
    requestId,
    action: `EVIDENCIA_SUBIDA`,
    userId,
    userName,
    details: `Tipo: ${evidence.type}${evidence.ocrData ? ', OCR procesado' : ''}`
  });
  
  return requests[index];
}

// Audit log functions
export function getAuditLogs(): AuditLog[] {
  return getItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
}

export function getAuditLogsByRequest(requestId: string): AuditLog[] {
  return getAuditLogs().filter(log => log.requestId === requestId);
}

export function createAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
  const logs = getAuditLogs();
  const newLog: AuditLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString()
  };
  logs.push(newLog);
  setItem(STORAGE_KEYS.AUDIT_LOGS, logs);
  return newLog;
}

// Preferences functions
export function getPreferences(): UserPreference[] {
  return getItem<UserPreference[]>(STORAGE_KEYS.PREFERENCES, DEFAULT_PREFERENCES);
}

export function getUserPreferences(userId: string): UserPreference[] {
  return getPreferences().filter(p => p.userId === userId);
}

export function getDefaultAmount(userId: string, type: string): number | null {
  const pref = getPreferences().find(p => p.userId === userId && p.type === type);
  return pref?.defaultAmount || null;
}

export function setUserPreference(pref: UserPreference): void {
  const prefs = getPreferences();
  const index = prefs.findIndex(p => p.userId === pref.userId && p.type === pref.type);
  if (index >= 0) {
    prefs[index] = pref;
  } else {
    prefs.push(pref);
  }
  setItem(STORAGE_KEYS.PREFERENCES, prefs);
}

// Notification functions
export function getNotifications(): Notification[] {
  return getItem<Notification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
}

export function getUserNotifications(userId: string): Notification[] {
  return getNotifications()
    .filter(n => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>): Notification {
  const notifications = getNotifications();
  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}`,
    read: false,
    createdAt: new Date().toISOString()
  };
  notifications.push(newNotification);
  setItem(STORAGE_KEYS.NOTIFICATIONS, notifications);
  return newNotification;
}

export function markNotificationRead(id: string): void {
  const notifications = getNotifications();
  const index = notifications.findIndex(n => n.id === id);
  if (index >= 0) {
    notifications[index].read = true;
    setItem(STORAGE_KEYS.NOTIFICATIONS, notifications);
  }
}

// Config functions
export function getConfig(): SystemConfig {
  return getItem<SystemConfig>(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG);
}

export function updateConfig(updates: Partial<SystemConfig>): SystemConfig {
  const config = { ...getConfig(), ...updates };
  setItem(STORAGE_KEYS.CONFIG, config);
  return config;
}

// Export function
export function exportData(startDate?: string, endDate?: string): string {
  const requests = getRequests().filter(r => {
    if (!startDate || !endDate) return true;
    const createdAt = new Date(r.createdAt);
    return createdAt >= new Date(startDate) && createdAt <= new Date(endDate);
  });
  
  const requestIds = requests.map(r => r.id);
  const auditLogs = getAuditLogs().filter(log => requestIds.includes(log.requestId));
  const evidences = requests.flatMap(r => r.evidences);
  
  const user = getCurrentUser();
  
  const exportData = {
    requests,
    auditLogs,
    evidences,
    generatedAt: new Date().toISOString(),
    generatedBy: user?.name || 'Sistema',
    dateRange: startDate && endDate ? { start: startDate, end: endDate } : undefined
  };
  
  return JSON.stringify(exportData, null, 2);
}

// Check and process reminders/escalations
export function processRemindersAndEscalations(): void {
  const config = getConfig();
  const requests = getRequests();
  const now = new Date();
  const users = getUsers();
  
  requests.forEach(request => {
    if (['validada', 'liquidada', 'rechazada'].includes(request.status)) return;
    
    const lastUpdate = new Date(request.updatedAt);
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    
    // Check for reminders
    if (hoursSinceUpdate >= config.reminderIntervalHours) {
      const lastReminder = request.lastReminderAt ? new Date(request.lastReminderAt) : null;
      const hoursSinceReminder = lastReminder 
        ? (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60)
        : config.reminderIntervalHours;
      
      if (hoursSinceReminder >= config.reminderIntervalHours) {
        // Send reminder based on status
        let notifyUserId = '';
        let message = '';
        
        if (request.status === 'enviada') {
          const pagosUser = users.find(u => u.role === 'pagos');
          if (pagosUser) {
            notifyUserId = pagosUser.id;
            message = `Solicitud ${request.numero} pendiente de aprobacion`;
          }
        } else if (request.status === 'aprobada' || request.status === 'transferida') {
          notifyUserId = request.userId;
          message = `Solicitud ${request.numero} pendiente de comprobante/factura`;
        }
        
        if (notifyUserId) {
          createNotification({
            userId: notifyUserId,
            title: 'Recordatorio',
            message,
            type: 'warning',
            requestId: request.id
          });
          
          updateRequest(request.id, {
            remindersSent: (request.remindersSent || 0) + 1,
            lastReminderAt: now.toISOString()
          }, 'system', 'Sistema');
        }
      }
    }
    
    // Check for escalation
    if (hoursSinceUpdate >= config.escalationThresholdHours) {
      const currentLevel = request.escalationLevel || 0;
      if (currentLevel < config.maxEscalationLevel) {
        const adminUser = users.find(u => u.role === 'admin');
        if (adminUser) {
          createNotification({
            userId: adminUser.id,
            title: 'Escalacion',
            message: `Solicitud ${request.numero} escalada a nivel ${currentLevel + 1}`,
            type: 'error',
            requestId: request.id
          });
          
          updateRequest(request.id, {
            escalationLevel: currentLevel + 1,
            escalatedAt: now.toISOString()
          }, 'system', 'Sistema');
        }
      }
    }
  });
}

// Check for delta (difference between approved and invoice amount)
export function checkDelta(request: Request): number | null {
  if (!request.approvedAmount) return null;
  
  const invoiceEvidence = request.evidences.find(e => e.type === 'factura' && e.ocrData?.total);
  if (!invoiceEvidence?.ocrData?.total) return null;
  
  const delta = invoiceEvidence.ocrData.total - request.approvedAmount;
  return Math.abs(delta) > 0.01 ? delta : null;
}

// Unified storage object for exports
export const storage = {
  getUsers,
  getCurrentUser,
  setCurrentUser,
  login,
  logout,
  getRequests,
  getRequestsByUser,
  getRequestsByStatus,
  getRequestById,
  createRequest,
  updateRequest,
  addEvidenceToRequest,
  getAuditLogs,
  getAuditLogsByRequest,
  createAuditLog,
  getPreferences,
  getUserPreferences,
  getDefaultAmount,
  setUserPreference,
  getNotifications,
  getUserNotifications,
  createNotification,
  markNotificationRead,
  getConfig,
  updateConfig,
  exportData,
  processRemindersAndEscalations,
  checkDelta,
  initializeStorage,
  // Aliases for compatibility
  getSolicitudes: getRequests,
};
