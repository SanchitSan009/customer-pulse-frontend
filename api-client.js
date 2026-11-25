/* Public configuration only. Credentials live in memory until this page closes. */
(() => {
  'use strict';
  const origin = 'https://customer-pulse-sanchitsan009.onrender.com';
  const routes = new Set(['/api/pi/metrics', '/api/agricon/metrics', '/api/canon/conversations', '/api/dashboard/summary']);
  let authorization = null;
  let pendingLogin = null;
  let resolveLogin = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'dashboard-login';
  dialog.innerHTML = `<form><h1>Dashboard sign in</h1><p>Use your dashboard login to load private metrics.</p>
    <label>Username<input name="username" autocomplete="username" required value="display"></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <p role="status" aria-live="polite"></p><button type="submit">Sign in</button></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[role="status"]');
  const submit = dialog.querySelector('button');
  const signOut = document.createElement('button');
  signOut.className = 'dashboard-signout';
  signOut.textContent = 'Sign out';
  signOut.hidden = true;
  signOut.addEventListener('click', () => { authorization = null; location.reload(); });
  document.body.append(signOut);
  dialog.addEventListener('cancel', event => event.preventDefault());
  function login(message = '') {
    if (!pendingLogin) {
      pendingLogin = new Promise(resolve => { resolveLogin = resolve; });
      status.textContent = message;
      if (!dialog.open) dialog.showModal();
    }
    return pendingLogin;
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Connecting… The service may take a minute to wake up.';
    const bytes = new TextEncoder().encode(`${form.elements.username.value}:${form.elements.password.value}`);
    const candidate = 'Basic ' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    try {
      const response = await fetch(origin + '/api/dashboard/summary', {
        headers: {Authorization: candidate}, credentials: 'omit', cache: 'no-store',
        signal: AbortSignal.timeout(90000), redirect: 'error',
      });
      if (response.status === 401) throw Error('Username or password is incorrect.');
      if (response.status === 429) throw Error('Too many sign-in attempts. Wait a minute and retry.');
      if (response.status !== 200 && response.status !== 503) throw Error('The API did not accept this connection.');
      authorization = candidate;
      form.elements.password.value = '';
      status.textContent = '';
      dialog.close();
      signOut.hidden = false;
      const resolve = resolveLogin;
      pendingLogin = null;
      resolveLogin = null;
      resolve();
    } catch (error) {
      status.textContent = error instanceof TypeError ? 'Cannot reach the API. Retry shortly; the frontend origin must be allowed on the server.' : error.message;
    } finally { submit.disabled = false; }
  });
  window.DashboardAPI = {async fetch(path, options = {}) {
    const url = new URL(path, origin);
    if (url.origin !== origin || !routes.has(url.pathname)) throw Error('Unsupported API route.');
    if (!authorization) await login();
    const headers = new Headers(options.headers);
    headers.set('Authorization', authorization);
    const response = await fetch(url, {...options, headers, credentials: 'omit', cache: 'no-store', redirect: 'error'});
    if (response.status === 401) {
      authorization = null;
      signOut.hidden = true;
      await login('Your session is no longer valid. Sign in again.');
      return window.DashboardAPI.fetch(path, options);
    }
    return response;
  }};
})();
