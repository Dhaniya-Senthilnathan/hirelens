(function () {
  const defaultLocalApi = 'http://127.0.0.1:8000';
  const configuredApi = window.HIRELENS_API_BASE || '';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const deploymentApi = configuredApi || (isLocal ? defaultLocalApi : window.location.origin);

  window.HIRELENS_API_BASE = deploymentApi;
  window.HIRELENS_SITE_BASE = window.location.hostname.endsWith('github.io') ? '/hirelens' : '';

  window.HIRELENS_ROUTE = function (path) {
    const cleanPath = path || '/';
    if (window.HIRELENS_SITE_BASE && cleanPath.startsWith('/')) {
      return `${window.HIRELENS_SITE_BASE}${cleanPath}`;
    }
    return cleanPath;
  };
})();
(function () {
  const defaultLocalApi = 'http://127.0.0.1:8000';
  const configuredApi = window.HIRELENS_API_BASE || '';
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const deploymentApi = configuredApi || (isLocal ? defaultLocalApi : window.location.origin);

  window.HIRELENS_API_BASE = deploymentApi;
  window.HIRELENS_SITE_BASE = window.location.hostname.endsWith('github.io') ? '/hirelens' : '';

  window.HIRELENS_ROUTE = function (path) {
    const cleanPath = path || '/';
    if (window.HIRELENS_SITE_BASE && cleanPath.startsWith('/')) {
      return `${window.HIRELENS_SITE_BASE}${cleanPath}`;
    }
    return cleanPath;
  };
})();
