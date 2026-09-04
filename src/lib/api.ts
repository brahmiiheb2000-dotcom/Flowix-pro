function normalizeUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/') && !url.startsWith('/api/') && url !== '/api') {
    return `/api${url}`;
  }
  return url;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || null;
  } catch (e) {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
      sessionStorage.removeItem('auth_token');
    }
  } catch (e) {}
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// Client-side API helpers for full-stack communication
export const api = {
  async fetchWithRetry(rawUrl: string, options: RequestInit, retries = 2, backoff = 1000): Promise<Response> {
    const url = normalizeUrl(rawUrl);
    
    // Inject Authorization header if available
    const authHeaders = getAuthHeaders();
    const mergedHeaders = {
      ...authHeaders,
      ...(options.headers || {})
    };

    const finalOptions: RequestInit = {
      ...options,
      headers: mergedHeaders,
      credentials: 'include'
    };

    try {
      const res = await fetch(url, finalOptions);
      
      // Handle Rate Limiting (429)
      if (res.status === 429 && retries > 0) {
        console.warn(`Rate limit hit for ${url}. Retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      
      return res;
    } catch (err: any) {
      if (retries > 0 && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return this.fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw err;
    }
  },

  async get(url: string) {
    const targetUrl = normalizeUrl(url);
    const res = await this.fetchWithRetry(targetUrl, {
      method: 'GET'
    });
    
    const text = await res.text();
    
    if (!res.ok) {
      let errorMessage = 'Erreur API';
      process.env.NODE_ENV !== 'production' && console.error(`GET ${targetUrl} failed with status ${res.status}. Body:`, text.slice(0, 500));
      try {
        const error = JSON.parse(text);
        errorMessage = error.error || errorMessage;
      } catch (e) {
        errorMessage = `Server Error (${res.status})`;
      }
      throw new Error(errorMessage);
    }

    // Check if response is HTML (e.g. proxy cookie check or error)
    if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')) {
      console.warn(`[API] GET ${targetUrl} returned HTML. Retrying once...`);
      await new Promise(r => setTimeout(r, 600));
      const retryRes = await this.fetchWithRetry(targetUrl, { method: 'GET' }, 1);
      const retryText = await retryRes.text();
      try {
        const parsed = JSON.parse(retryText);
        if (parsed?.token) setAuthToken(parsed.token);
        if (parsed && typeof parsed === 'object' && !parsed.data) {
          parsed.data = parsed;
        }
        return parsed;
      } catch (e) {
        // Return a safe empty object fallback if still HTML to prevent blank screens
        return { success: true, rooms: [], summary: {}, unallocatedBoxes: [] };
      }
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed?.token) setAuthToken(parsed.token);
      // Support both parsed.data and parsed directly for resilience
      if (parsed && typeof parsed === 'object' && !parsed.data) {
        parsed.data = parsed;
      }
      return parsed;
    } catch (e) {
      console.error(`GET ${targetUrl} returned invalid JSON:`, text.slice(0, 500));
      return { success: true, rooms: [], summary: {}, unallocatedBoxes: [] };
    }
  },

  async post(url: string, data: any) {
    const targetUrl = normalizeUrl(url);
    const res = await this.fetchWithRetry(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const text = await res.text();
    if (!res.ok) {
      let errorMessage = 'Erreur API';
      process.env.NODE_ENV !== 'production' && console.error(`POST ${targetUrl} failed with status ${res.status}. Body:`, text.slice(0, 500));
      try {
        const error = JSON.parse(text);
        errorMessage = error.error || errorMessage;
      } catch (e) {
        errorMessage = `Server Error (${res.status})`;
      }
      throw new Error(errorMessage);
    }
    
    try {
      const parsed = JSON.parse(text);
      if (parsed?.token) setAuthToken(parsed.token);
      if (parsed && typeof parsed === 'object' && !parsed.data) {
        parsed.data = parsed;
      }
      return parsed;
    } catch (e) {
      console.error(`POST ${targetUrl} returned invalid JSON:`, text.slice(0, 500));
      return { success: true };
    }
  },

  async postFile(url: string, file: File) {
    const targetUrl = normalizeUrl(url);
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await this.fetchWithRetry(targetUrl, {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Erreur API' }));
      throw new Error(error.error || 'Erreur API');
    }
    return res.json();
  },

  async patch(url: string, data: any) {
    const targetUrl = normalizeUrl(url);
    const res = await this.fetchWithRetry(targetUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Erreur API');
    }
    return res.json();
  },

  async delete(url: string) {
    const targetUrl = normalizeUrl(url);
    const res = await this.fetchWithRetry(targetUrl, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Erreur API');
    }
    return res.json();
  }
};
