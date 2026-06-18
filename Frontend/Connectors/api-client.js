(function() {
    const API_BASE_URL = 'http://127.0.0.1:5087/api';
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
        const response = await fetch(API_BASE_URL + path, {
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    window.ApiClient = {
        baseUrl: API_BASE_URL,
        request,
        setAccessToken(token) {
            sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
        },
        clearAccessToken() {
            sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        },
        hasAccessToken() {
            return Boolean(sessionStorage.getItem(ACCESS_TOKEN_KEY));
        }
    };

    window.ApiError = ApiError;
})();
