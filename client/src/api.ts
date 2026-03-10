const API_BASE = '/api/v1';

export function getToken(): string | null {
  return localStorage.getItem('dentaflow_token');
}

export function setToken(token: string) {
  localStorage.setItem('dentaflow_token', token);
}

export function clearToken() {
  localStorage.removeItem('dentaflow_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (data: any) =>
    request<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  googleAuth: (token: string, clinicName?: string) =>
    request<{ token: string; user: any }>('/auth/google', { method: 'POST', body: JSON.stringify({ token, clinicName }) }),

  // Patients
  getPatients: (params?: string) => request<any>(`/patients${params ? `?${params}` : ''}`),
  getPatient: (id: string) => request<any>(`/patients/${id}`),
  createPatient: (data: any) => request<any>('/patients', { method: 'POST', body: JSON.stringify(data) }),
  bulkImportPatients: (patients: any[]) => request<any>('/patients/bulk', { method: 'POST', body: JSON.stringify({ patients }) }),
  uploadPatientDocument: (patientId: string, data: any) => request<any>(`/patients/${patientId}/documents`, { method: 'POST', body: JSON.stringify(data) }),

  // Appointments
  getAppointments: (params?: string) => request<any>(`/appointments${params ? `?${params}` : ''}`),
  getAppointment: (id: string) => request<any>(`/appointments/${id}`),
  updateAppointment: (id: string, data: any) =>
    request<any>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Analytics
  getAnalyticsOverview: (range?: number) => request<any>(`/analytics/overview?range=${range || 30}`),

  // No-show rules
  getChronicCancellers: () => request<any>('/no-show-rules/chronic'),

  // Reminders
  getReminders: (params?: string) => request<any>(`/reminders${params ? `?${params}` : ''}`),
  triggerReminder: (appointmentId: string) =>
    request<any>('/reminders', { method: 'POST', body: JSON.stringify({ appointmentId }) }),

  // Campaigns
  getCampaigns: () => request<any>('/campaigns'),
  createCampaign: (data: any) =>
    request<any>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),

  // Settings & Profile
  getProfile: () => request<any>('/users/me'),
  updateProfile: (data: any) => request<any>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  rotateApiKey: () => request<any>('/users/me/api-key', { method: 'POST' }),
  
  // External Webhooks
  getWebhooks: () => request<any>('/users/webhooks'),
  createWebhook: (data: any) => request<any>('/users/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  deleteWebhook: (id: string) => request<any>(`/users/webhooks/${id}`, { method: 'DELETE' }),
};
