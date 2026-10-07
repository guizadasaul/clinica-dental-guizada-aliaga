/**
 * Auditoría de responsividad: detecta en la pantalla actual lo que se rompe en
 * un celular. Se corre en el navegador, no en el CI.
 *
 * Uso rápido (DevTools → Console, con el modo dispositivo en 360×740 o 390×844):
 *   1. Pegar este archivo entero.
 *   2. Llamar a `responsiveAudit()`. Devuelve `{ viewport, total, issues }` y
 *      deja una tabla en la consola.
 *
 * Para revisar varios anchos sin tocar la ventana: `responsiveHarness(360)`
 * reemplaza la página por un iframe de ese ancho con la misma app (misma
 * sesión, mismo origen); después `responsiveAudit(responsiveFrame())` audita
 * lo que se ve dentro.
 *
 * Qué marca:
 *   - page-scroll: la página entera se desliza de costado.
 *   - offscreen: algo visible que sale del ancho de la pantalla (fuera de un
 *     contenedor con scroll propio). html/body tienen `overflow-x: hidden`,
 *     así que en el celular eso queda cortado sin que se note.
 *   - cut: un contenedor que esconde contenido de costado (overflow hidden/clip)
 *     sin ser un texto con "…".
 *   - tap: botones, links e inputs de menos de 40×40 px (la guía de Apple pide
 *     44; menos de 32 se marca como grave).
 *   - text: texto de menos de 12 px.
 *   - input-zoom: inputs con letra de menos de 16 px: iOS hace zoom al enfocarlos.
 *   - dialog: un diálogo más alto que la pantalla sin scroll propio.
 *   - hscroll: una caja con scroll horizontal propio. No es un error en sí
 *     (las tablas de reportes lo usan a propósito), pero en una lista del
 *     panel suele querer decir que hace falta la versión en tarjetas.
 */

/* eslint-disable no-console */
(function (global) {
  const TAP_MIN = 40;
  const TAP_GRAVE = 32;

  function describe(el) {
    const id = el.id ? `#${el.id}` : '';
    const cls = [...el.classList].slice(0, 2).map((c) => `.${c}`).join('');
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  }

  function isVisible(el, win) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** Dentro de un contenedor con scroll horizontal propio: desbordar ahí es intencional. */
  function inScrollContainer(el, win) {
    for (let p = el.parentElement; p && p !== win.document.body; p = p.parentElement) {
      const ox = win.getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') {
        return true;
      }
    }
    return false;
  }

  /** Paneles fuera de pantalla a propósito (sidebar cerrado, toasts escondidos). */
  function intentionallyHidden(rect, vw) {
    return rect.right <= 0 || rect.left >= vw;
  }

  function responsiveAudit(win = global) {
    const doc = win.document;
    const vw = doc.documentElement.clientWidth;
    const vh = win.innerHeight;
    const issues = [];
    const add = (type, el, detail, grave = false) =>
      issues.push({ type, grave, element: describe(el), detail });
    const offscreen = new Set();

    for (const el of doc.body.querySelectorAll('*')) {
      if (!isVisible(el, win) || (el.closest('svg') && el.tagName.toLowerCase() !== 'svg')) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      // Entero fuera de pantalla a propósito (sidebar cerrado): nada que revisar.
      if (intentionallyHidden(rect, vw)) {
        continue;
      }
      const style = win.getComputedStyle(el);

      if (
        (rect.right > vw + 1 || rect.left < -1) &&
        !intentionallyHidden(rect, vw) &&
        style.position !== 'fixed' &&
        !inScrollContainer(el, win) &&
        !(el.parentElement && offscreen.has(el.parentElement))
      ) {
        offscreen.add(el);
        add('offscreen', el, `${Math.round(rect.left)}→${Math.round(rect.right)} de ${vw}px`, true);
      } else if (style.position === 'fixed' && (rect.right > vw + 1 || rect.left < -1) && !intentionallyHidden(rect, vw)) {
        add('offscreen', el, `fixed ${Math.round(rect.left)}→${Math.round(rect.right)} de ${vw}px`, true);
      }

      if (
        (style.overflowX === 'hidden' || style.overflowX === 'clip') &&
        style.textOverflow !== 'ellipsis' &&
        el.scrollWidth > el.clientWidth + 2 &&
        el.clientWidth > 1 && // los textos solo para lectores de pantalla miden 1 px a propósito
        el !== doc.body &&
        el !== doc.documentElement
      ) {
        add('cut', el, `${el.scrollWidth}px de contenido en ${el.clientWidth}px`, true);
      }

      const tag = el.tagName.toLowerCase();
      const interactive =
        tag === 'button' ||
        tag === 'select' ||
        (tag === 'a' && el.hasAttribute('href') && !el.closest('p')) ||
        (tag === 'input' && !['hidden'].includes(el.type)) ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('role') === 'tab' ||
        el.getAttribute('role') === 'menuitem';
      if (interactive && !el.disabled) {
        const small = Math.min(rect.width, rect.height);
        if (small < TAP_MIN) {
          add('tap', el, `${Math.round(rect.width)}×${Math.round(rect.height)}px`, small < TAP_GRAVE);
        }
      }

      if ((tag === 'input' && !['checkbox', 'radio', 'range', 'color'].includes(el.type)) || tag === 'select' || tag === 'textarea') {
        if (parseFloat(style.fontSize) < 16) {
          add('input-zoom', el, `letra ${style.fontSize}`);
        }
      }

      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (ownText && parseFloat(style.fontSize) < 12) {
        add('text', el, `letra ${style.fontSize}`);
      }

      if (
        ['auto', 'scroll'].includes(style.overflowX) &&
        el.scrollWidth > el.clientWidth + 2 &&
        el !== doc.documentElement
      ) {
        add('hscroll', el, `${el.scrollWidth}px de contenido en ${el.clientWidth}px`);
      }

      const isDialog = el.getAttribute('role') === 'dialog' || tag === 'dialog' || el.getAttribute('aria-modal') === 'true';
      if (isDialog && rect.height > vh + 1) {
        const scrolls = ['auto', 'scroll'].includes(style.overflowY);
        if (!scrolls) {
          add('dialog', el, `${Math.round(rect.height)}px de alto en ${vh}px sin scroll`, true);
        }
      }
    }

    // La página entera se desliza de costado: lo que se ve en el celular como
    // "la pantalla baila" al hacer scroll.
    if (doc.documentElement.scrollWidth > vw + 1) {
      add('page-scroll', doc.documentElement, `la página mide ${doc.documentElement.scrollWidth}px de ancho en ${vw}px`, true);
    }

    const summary = issues.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] ?? 0) + 1 }), {});
    console.table(issues);
    return { url: win.location.pathname, viewport: `${vw}×${vh}`, total: issues.length, summary, issues };
  }

  function responsiveHarness(width = 390, height = 844, path = global.location.pathname) {
    const doc = global.document;
    doc.body.innerHTML = '';
    doc.body.style.cssText = 'margin:0;background:#2b2b2b;display:flex;justify-content:center;align-items:flex-start;padding:16px;';
    const frame = doc.createElement('iframe');
    frame.id = 'responsive-frame';
    frame.src = path;
    frame.style.cssText = `width:${width}px;height:${height}px;border:0;background:#fff;box-shadow:0 0 0 1px #555;`;
    doc.body.appendChild(frame);
    return frame;
  }

  function responsiveFrame() {
    return global.document.getElementById('responsive-frame').contentWindow;
  }

  global.responsiveAudit = responsiveAudit;
  global.responsiveHarness = responsiveHarness;
  global.responsiveFrame = responsiveFrame;
})(window);
