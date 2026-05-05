// Client-side API helpers for full-stack communication
export const api = {
  async fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
    try {
      return await fetch(url, options);
    } catch (err: any) {
      if (retries > 0 && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw err;
    }
  },

  async get(url: string) {
    const res = await this.fetchWithRetry(url, {
      credentials: 'include'
    });
    const text = await res.text();
    if (!res.ok) {
      let errorMessage = 'Erreur API';
      process.env.NODE_ENV !== 'production' && console.error(`GET ${url} failed with status ${res.status}. Body:`, text.slice(0, 500));
      try {
        const error = JSON.parse(text);
        errorMessage = error.error || errorMessage;
      } catch (e) {
        errorMessage = `Server Error (${res.status})`;
      }
      throw new Error(errorMessage);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`GET ${url} returned invalid JSON:`, text.slice(0, 500));
      throw new Error("La réponse du serveur n'est pas au format JSON valide.");
    }
  },

  async post(url: string, data: any) {
    const res = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    
    const text = await res.text();
    if (!res.ok) {
      let errorMessage = 'Erreur API';
      process.env.NODE_ENV !== 'production' && console.error(`POST ${url} failed with status ${res.status}. Body:`, text.slice(0, 500));
      try {
        const error = JSON.parse(text);
        errorMessage = error.error || errorMessage;
      } catch (e) {
        errorMessage = `Server Error (${res.status})`;
      }
      throw new Error(errorMessage);
    }
    
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error(`POST ${url} returned invalid JSON:`, text.slice(0, 500));
      throw new Error("La réponse du serveur n'est pas au format JSON valide.");
    }
  },

  async patch(url: string, data: any) {
    const res = await this.fetchWithRetry(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Erreur API');
    }
    return res.json();
  },

  async delete(url: string) {
    const res = await this.fetchWithRetry(url, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Erreur API');
    }
    return res.json();
  }
};
