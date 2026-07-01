(function() {
    const path = window.location.pathname || '/';
    const basePath = path.endsWith('/')
        ? path
        : path.slice(0, path.lastIndexOf('/') + 1);
    const isXamppWorkspace =
        basePath.toLowerCase().includes('/formrequestsystem/');
    const isProtectedPublicGateway =
        window.location.port === '8090' ||
        window.location.hostname === 'gatepass-practice.local' ||
        window.location.hostname.endsWith('.trycloudflare.com');
    const directApiUrl =
        `${window.location.protocol}//${window.location.hostname}:5087/api`;

    window.GatePassConfig = Object.freeze({
        apiAuthorizationHeader: isProtectedPublicGateway
            ? 'X-Api-Authorization'
            : 'Authorization',
        apiBaseUrl: window.location.protocol === 'file:'
            ? 'http://127.0.0.1:5087/api'
            : isXamppWorkspace || window.location.port === '5500'
                ? directApiUrl
            : `${window.location.origin}${basePath}api`
    });
})();
