(function() {
    const configuredApiBaseUrl = window.GatePassConfig?.apiBaseUrl;
    const fallbackApiBaseUrl =
        window.location.protocol === 'file:'
            ? 'http://127.0.0.1:5087/api'
            : `${window.location.origin}/api`;
    const API_BASE_URL = (configuredApiBaseUrl || fallbackApiBaseUrl)
        .replace(/\/+$/, '');
    const AUTHORIZATION_HEADER =
        window.GatePassConfig?.apiAuthorizationHeader || 'Authorization';
    const ACCESS_TOKEN_KEY = 'gatePassAccessToken';

    class ApiError extends Error {
        constructor(status, message, payload = null) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.payload = payload;
        }
    }

    async function request(path, options = {}) {
        const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
        const isFormData = options.body instanceof FormData;
        const response = await fetch(API_BASE_URL + path, {
            headers: {
                ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
                ...(token
                    ? { [AUTHORIZATION_HEADER]: `Bearer ${token}` }
                    : {}),
                ...(options.headers || {})
            },
            ...options
        });

        if (!response.ok) {
            let payload = null;
            try {
                payload = await response.json();
            } catch {
                // Some API failures intentionally have no JSON body.
            }

            throw new ApiError(
                response.status,
                payload?.message || payload?.error || `API request failed: ${response.status}`,
                payload
            );
        }

        if (response.status === 204) return null;
        return response.json();
    }

    async function data(path, options = {}) {
        const response = await request(path, options);
        return response?.data ?? response;
    }

    async function blob(path, options = {}) {
        const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
        const response = await fetch(API_BASE_URL + path, {
            headers: {
                ...(token
                    ? { [AUTHORIZATION_HEADER]: `Bearer ${token}` }
                    : {}),
                ...(options.headers || {})
            },
            ...options
        });
        if (!response.ok) {
            let payload = null;
            try { payload = await response.json(); } catch {}
            throw new ApiError(
                response.status,
                payload?.message || `API request failed: ${response.status}`,
                payload
            );
        }
        return response.blob();
    }

    window.ApiClient = {
        baseUrl: API_BASE_URL,
        request,
        data,
        blob,
        get(path) {
            return data(path);
        },
        post(path, body) {
            return data(path, {
                method: 'POST',
                body: body instanceof FormData ? body : JSON.stringify(body)
            });
        },
        put(path, body) {
            return data(path, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
        },
        setAccessToken(token) {
            sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
        },
        clearAccessToken() {
            sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        },
        hasAccessToken() {
            return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY));
        },
        isDatabaseSession() {
            return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY));
        }
    };

    window.ApiError = ApiError;
})();
