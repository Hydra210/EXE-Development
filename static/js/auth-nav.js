/**
 * EXE Development — shared account-aware nav widget.
 *
 * Include this on any page that has a nav link marked with
 * data-auth-slot="signin". On load it asks this site's own backend
 * (/api/auth/session) whether the visitor is logged in — the backend reads
 * the httpOnly session cookie and talks to the Accounts API server-side, so
 * no token ever touches this script. If someone is logged in, the "Sign in"
 * link is swapped for a "Logged in as {name}" button with a small dropdown
 * (Account settings, Log out). If not, the page is left alone.
 */
(function () {
  const STYLE_ID = 'exe-auth-nav-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .exe-account-menu { position: relative; display: inline-block; font-family: inherit; }
      .exe-account-trigger {
        display: inline-flex; align-items: center; gap: 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.14);
        color: inherit; font: inherit; font-size: 14px; font-weight: 500;
        padding: 8px 14px; border-radius: 100px; cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        white-space: nowrap;
      }
      .exe-account-trigger:hover { background: rgba(255,255,255,0.11); border-color: rgba(255,255,255,0.22); }
      .exe-account-avatar {
        width: 20px; height: 20px; border-radius: 50%;
        background: linear-gradient(155deg, #b794f6, #7c3aed);
        color: #fff; font-size: 11px; font-weight: 700;
        display: inline-flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .exe-account-caret { width: 10px; height: 10px; opacity: 0.6; transition: transform 0.15s ease; }
      .exe-account-menu.is-open .exe-account-caret { transform: rotate(180deg); }
      .exe-account-dropdown {
        position: absolute; top: calc(100% + 8px); right: 0;
        min-width: 190px;
        background: #17120d; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 14px; padding: 6px;
        box-shadow: 0 18px 40px rgba(0,0,0,0.4);
        opacity: 0; visibility: hidden; transform: translateY(-6px);
        transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
        z-index: 200;
      }
      .exe-account-menu.is-open .exe-account-dropdown {
        opacity: 1; visibility: visible; transform: translateY(0);
      }
      .exe-account-dropdown-item {
        display: block; width: 100%; text-align: left;
        background: none; border: none; color: #f0e4d2; font: inherit; font-size: 13.5px;
        padding: 10px 12px; border-radius: 9px; cursor: pointer;
      }
      .exe-account-dropdown-item:hover { background: rgba(255,255,255,0.07); }
      .exe-account-dropdown-item.is-muted { color: rgba(240,228,210,0.45); cursor: default; }
      .exe-account-dropdown-item.is-muted:hover { background: none; }
      .exe-account-dropdown-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 6px 4px; }
      .exe-account-dropdown-item.is-danger { color: #f7b6b6; }
      .exe-account-dropdown-item.is-danger:hover { background: rgba(247,118,118,0.1); }
    `;
    document.head.appendChild(style);
  }

  function initial(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function buildMenu(user) {
    const wrap = document.createElement('div');
    wrap.className = 'exe-account-menu';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'exe-account-trigger';
    trigger.innerHTML =
      '<span class="exe-account-avatar">' + initial(user.display_name) + '</span>' +
      '<span>Logged in as ' + escapeHtml(user.display_name || user.email) + '</span>' +
      '<svg class="exe-account-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

    const dropdown = document.createElement('div');
    dropdown.className = 'exe-account-dropdown';

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'exe-account-dropdown-item is-muted';
    settingsBtn.textContent = 'Account settings (coming soon)';
    settingsBtn.disabled = true;

    const divider = document.createElement('div');
    divider.className = 'exe-account-dropdown-divider';

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'exe-account-dropdown-item is-danger';
    logoutBtn.textContent = 'Log out';
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.textContent = 'Logging out…';
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) { /* best-effort */ }
      window.location.href = '/';
    });

    dropdown.appendChild(settingsBtn);
    dropdown.appendChild(divider);
    dropdown.appendChild(logoutBtn);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      wrap.classList.toggle('is-open');
    });
    document.addEventListener('click', () => wrap.classList.remove('is-open'));

    wrap.appendChild(trigger);
    wrap.appendChild(dropdown);
    return wrap;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function init() {
    const slot = document.querySelector('[data-auth-slot="signin"]');
    if (!slot) return;

    let data;
    try {
      const res = await fetch('/api/auth/session');
      data = await res.json();
    } catch (e) {
      return; // network hiccup — leave "Sign in" as-is
    }

    if (data && data.user) {
      const menu = buildMenu(data.user);
      slot.replaceWith(menu);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
