// Placeholder for future backend API calls. The prototype still uses mock data.
(function() {
    const API_BASE_URL = 'http://127.0.0.1:5000/api';

    async function request(path, options = {}) {
        const response = await fetch(API_BASE_URL + path, {
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    window.ApiClient = {
        baseUrl: API_BASE_URL,
        request
    };
})();
