(function() {
    const host = window.location.hostname || '127.0.0.1';

    window.GatePassConfig = Object.freeze({
        apiBaseUrl: `${window.location.protocol}//${host}:5087/api`
    });
})();
