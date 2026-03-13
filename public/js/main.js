async function checkAuth() {
    const res = await fetch('/api/user');
    if (!res.ok && window.location.pathname !== '/' && window.location.pathname !== '/login' && window.location.pathname !== '/register') window.location.href = '/login';
    return res.ok ? (await res.json()).user : null;
}
async function logout() { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }
function escapeHtml(t) { if(!t)return''; const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }
function formatDate(d) { return new Date(d).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}); }
