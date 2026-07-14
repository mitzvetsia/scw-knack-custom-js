/*** CHANGE ORDER HEADER CARD (view_4092) **********************************
 *
 * The CO scene's header form renders raw: an unlabeled equation value
 * ("1410"), an unlabeled status ("Draft"), Builder-facing input labels
 * ("INPUT: sow friendly name" / "INPUT_notes"), and a bare Submit. Nothing
 * tells the user where they are.
 *
 * Recompose it into a header card:
 *   - Eyebrow "CHANGE ORDER" + big CO number + status pill (read from the
 *     two read-only fields, which are then hidden)
 *   - Human labels: "Change order name" / "Notes"
 *   - Submit → "Save details"
 *
 * Fields (Update SOW_sow header form):
 *   field_2123 — CO / SOW number (equation, read-only)
 *   field_2953 — CO status (read-only)   Draft/…/Void
 *   field_2126 — friendly name (input)
 *   field_2198 — notes (textarea)
 ***************************************************************************/
(function () {
  'use strict';

  var VIEW     = 'view_4092';
  var STYLE_ID = 'scw-co-hdr-css';
  var EVENT_NS = '.scwCoHeader';

  // Status → pill tone. Unknown statuses fall back to amber (in-flight).
  var STATUS_TONES = {
    'draft':    { fg: '#475569', bg: '#f1f5f9', bd: '#cbd5e1' },
    'issued':   { fg: '#0369a1', bg: '#e0f2fe', bd: '#bae6fd' },
    'accepted': { fg: '#15803d', bg: '#f0fdf4', bd: '#bbf7d0' },
    'applied':  { fg: '#15803d', bg: '#f0fdf4', bd: '#bbf7d0' },
    'declined': { fg: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
    'void':     { fg: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' }
  };
  var TONE_DEFAULT = { fg: '#b45309', bg: '#fffbeb', bd: '#fde68a' };

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Card shell around the whole form.
      '#' + VIEW + ' form{background:#fff;border:1px solid #e2e8f0;border-radius:10px;',
      'box-shadow:0 1px 2px rgba(15,23,42,.04);padding:16px 20px;}',
      // Hide the raw read-only value blocks — the header renders them.
      '#' + VIEW + ' #kn-input-field_2123, #' + VIEW + ' #kn-input-field_2953{display:none !important;}',
      // Breadcrumb row — says WHERE you are: this page is a child of the
      // Manage Deployment page, and the link goes back up.
      '.scw-co-crumb{display:flex;align-items:center;gap:8px;margin-bottom:10px;',
      'font:600 12px/1.2 system-ui,-apple-system,sans-serif;}',
      '.scw-co-crumb a{display:inline-flex;align-items:center;gap:6px;',
      'color:#0f4c75;text-decoration:none;padding:5px 10px;border:1px solid #c7d4e0;',
      'border-radius:6px;background:#fff;transition:background .12s;}',
      '.scw-co-crumb a:hover{background:#f1f5f9;text-decoration:none;}',
      '.scw-co-crumb-sep{color:#cbd5e1;}',
      '.scw-co-crumb-here{color:#64748b;font-weight:600;}',
      // Header strip.
      '.scw-co-hdr{display:flex;align-items:center;gap:12px;flex-wrap:wrap;',
      'padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid #e2e8f0;}',
      '.scw-co-hdr-id{display:flex;flex-direction:column;}',
      '.scw-co-hdr-eyebrow{font:700 10px/1.2 system-ui,-apple-system,sans-serif;',
      'letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;}',
      '.scw-co-hdr-num{font:700 20px/1.2 system-ui,-apple-system,sans-serif;color:#0f4c75;}',
      '.scw-co-hdr-pill{display:inline-flex;align-items:center;padding:5px 12px;',
      'border-radius:999px;font:700 11.5px/1 system-ui,sans-serif;letter-spacing:.02em;}',
      // Inputs: tidy labels, comfortable sizing.
      '#' + VIEW + ' .kn-label span{font:600 11px/1.2 system-ui,sans-serif;',
      'letter-spacing:.04em;text-transform:uppercase;color:#64748b;}',
      '#' + VIEW + ' textarea.kn-textarea{min-height:72px;}',
      // Save button.
      '#' + VIEW + ' .kn-submit .kn-button.is-primary{border-radius:7px;',
      'font:600 13px/1.2 system-ui,sans-serif;padding:9px 18px;}'
    ].join('');
    document.head.appendChild(s);
  }

  // Value of a read-only kn-input block = wrapper text minus label/instructions.
  function readOnlyValue(viewEl, fieldKey) {
    var wrap = viewEl.querySelector('#kn-input-' + fieldKey);
    if (!wrap) return '';
    var clone = wrap.cloneNode(true);
    var strip = clone.querySelectorAll('label, p.kn-instructions');
    for (var i = 0; i < strip.length; i++) {
      if (strip[i].parentNode) strip[i].parentNode.removeChild(strip[i]);
    }
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function setLabel(viewEl, fieldKey, text) {
    var span = viewEl.querySelector('#kn-input-' + fieldKey + ' .kn-label span');
    if (span && span.textContent !== text) span.textContent = text;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // Parent (Manage Deployment) hash: the CO page is a drill-in child — cut
  // the hash at the edit-change-order segment. Fallback: drop the trailing
  // slug + record-id pair.
  function parentHash() {
    var hash = (window.location.hash || '').replace(/^#/, '').split('?')[0]
      .replace(/\/+$/, '');
    var segs = hash.split('/');
    for (var i = 0; i < segs.length; i++) {
      if (/^edit-change-order/i.test(segs[i])) {
        return '#' + segs.slice(0, i).join('/') + '/';
      }
    }
    if (segs.length >= 2 && /^[a-f0-9]{24}$/i.test(segs[segs.length - 1])) {
      return '#' + segs.slice(0, -2).join('/') + '/';
    }
    return '';
  }

  function enhance() {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    var form = viewEl.querySelector('form');
    if (!form) return;
    injectCss();

    var num    = readOnlyValue(viewEl, 'field_2123');
    var status = readOnlyValue(viewEl, 'field_2953');
    var tone   = STATUS_TONES[status.toLowerCase()] || TONE_DEFAULT;

    // Breadcrumb: back-link to the parent Manage Deployment page + "you are
    // here". Lives INSIDE the card, above the header strip.
    var crumb = form.querySelector('.scw-co-crumb');
    if (!crumb) {
      crumb = document.createElement('div');
      crumb.className = 'scw-co-crumb';
      form.insertBefore(crumb, form.firstChild);
    }
    var pHash = parentHash();
    crumb.innerHTML =
      (pHash ? '<a href="' + esc(pHash) + '">&larr; Manage Deployment</a>' +
               '<span class="scw-co-crumb-sep">/</span>' : '') +
      '<span class="scw-co-crumb-here">Change Order' +
        (num ? ' ' + esc(num) : '') + '</span>';

    var hdr = form.querySelector('.scw-co-hdr');
    if (!hdr) {
      hdr = document.createElement('div');
      hdr.className = 'scw-co-hdr';
      form.insertBefore(hdr, crumb.nextSibling);
    }
    hdr.innerHTML =
      '<div class="scw-co-hdr-id">' +
        '<span class="scw-co-hdr-eyebrow">Change Order</span>' +
        '<span class="scw-co-hdr-num">' + esc(num || '—') + '</span>' +
      '</div>' +
      '<span class="scw-co-hdr-pill" style="color:' + tone.fg +
        ';background:' + tone.bg + ';border:1px solid ' + tone.bd + ';">' +
        esc(status || 'Unknown') + '</span>';

    setLabel(viewEl, 'field_2126', 'Change order name');
    setLabel(viewEl, 'field_2198', 'Notes');

    var btn = viewEl.querySelector('.kn-submit .kn-button.is-primary');
    if (btn && btn.textContent.trim() === 'Submit') btn.textContent = 'Save details';
  }

  function soon() { setTimeout(enhance, 50); }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, soon, EVENT_NS);
  }
  $(document).off('knack-view-render.' + VIEW + EVENT_NS)
    .on('knack-view-render.' + VIEW + EVENT_NS, soon);
})();
/*** END: CO header card ***************************************************/
