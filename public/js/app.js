// --- Session helpers (localStorage-based, simple prototype auth) ---
function getSession() {
  const raw = localStorage.getItem('gs_user');
  return raw ? JSON.parse(raw) : null;
}
function setSession(user) {
  localStorage.setItem('gs_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('gs_user');
}
function requireAuth(redirectTo = '/login.html') {
  const u = getSession();
  if (!u) window.location.href = redirectTo;
  return u;
}
function renderNavAuth() {
  const u = getSession();
  const slot = document.getElementById('navAuthSlot');
  if (!slot) return;
  if (u) {
    const dashLink = u.userType === 'admin' ? '/admin.html' : '/dashboard.html';
    slot.innerHTML = `<a href="${dashLink}" class="btn btn-ghost btn-sm">Dashboard</a><button onclick="doLogout()" class="btn btn-brass btn-sm">Logout</button>`;
  } else {
    slot.innerHTML = `<a href="/login.html" class="btn btn-ghost btn-sm">Login</a><a href="/apply.html" class="btn btn-brass btn-sm">Apply Now</a>`;
  }
}
function doLogout() {
  clearSession();
  window.location.href = '/index.html';
}

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Kuch galat ho gaya.');
  return data;
}

document.addEventListener('DOMContentLoaded', renderNavAuth);
