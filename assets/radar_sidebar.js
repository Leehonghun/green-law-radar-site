/* Work portal - collapsible level-one legal radar menu. Public UI only. */
(() => {
  'use strict';
  const aside = document.querySelector('.aside');
  const nav = aside?.querySelector('.nav');
  const oldHeading = aside?.querySelector(':scope > .nav-caption');
  if (!aside || !nav || !oldHeading || document.getElementById('radar-sidebar-toggle')) return;

  const items = [...nav.children].filter(el => el.matches('button[data-tab]'));
  if (!items.length) return;

  const submenu = document.createElement('div');
  submenu.id = 'radar-sidebar-submenu';
  submenu.className = 'radar-sidebar-submenu';
  nav.insertBefore(submenu, items[0]);
  items.forEach(el => submenu.appendChild(el));

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'radar-sidebar-toggle';
  toggle.className = 'radar-sidebar-toggle';
  toggle.setAttribute('aria-controls', submenu.id);
  const label = document.createElement('span');
  label.textContent = '1. 법규 레이더';
  const chevron = document.createElement('span');
  chevron.className = 'radar-sidebar-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';
  toggle.append(label, chevron);
  oldHeading.replaceWith(toggle);

  const setOpen = open => {
    submenu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
  };
  setOpen(false);
  toggle.addEventListener('click', () => setOpen(submenu.hidden));
  nav.querySelectorAll('button[data-portal-module]').forEach(b =>
    b.addEventListener('click', () => setOpen(false)));

  const style = document.createElement('style');
  style.id = 'radar-sidebar-menu-styles';
  style.textContent = `
    .aside .radar-sidebar-toggle {
      width:calc(100% - 18px); margin:0 9px 10px; padding:14px 12px;
      display:flex;align-items:center;justify-content:space-between;gap:10px;
      border:1px solid #476885;border-radius:10px;background:#294a65;
      color:#fff;text-align:left;font-size:16px;font-weight:800;cursor:pointer;
      font-family:inherit;
    }
    .aside .radar-sidebar-toggle:hover {background:#365c7c}
    .aside .radar-sidebar-toggle:focus-visible {outline:3px solid #9cc2ff;outline-offset:2px}
    .aside .radar-sidebar-chevron {font-size:22px;line-height:1;transition:transform .18s ease}
    .aside .radar-sidebar-submenu {display:flex;flex-direction:column;gap:5px;margin:0 0 12px}
    .aside .radar-sidebar-submenu[hidden] {display:none !important}
    .aside .radar-sidebar-submenu>button {margin-left:12px;padding-left:15px;font-size:13px;width:calc(100% - 12px)}
    .aside .nav>button[data-portal-module] {font-size:15px;font-weight:760}
    @media(max-width:780px){.aside .radar-sidebar-toggle{font-size:15px}}
  `;
  document.head.appendChild(style);
})();
