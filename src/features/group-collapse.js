diff --git a/src/features/group-collapse.js b/src/features/group-collapse.js
index 5c4e5b37c3671a69a4aeb249dce4163780441f18..b40bca432aacc71419b3572821d81198b27b3617 100644
--- a/src/features/group-collapse.js
+++ b/src/features/group-collapse.js
@@ -22,120 +22,211 @@
     try {
       return JSON.parse(localStorage.getItem(storageKey(sceneId, viewId)) || '{}');
     } catch {
       return {};
     }
   }
   function saveState(sceneId, viewId, state) {
     if (!PERSIST_STATE) return;
     try {
       localStorage.setItem(storageKey(sceneId, viewId), JSON.stringify(state));
     } catch {}
   }
 
   // ======================
   // CSS (ONCE, SCENE-SCOPED)
   // ======================
   function injectCssOnce() {
     const id = 'scw-group-collapse-css';
     if (document.getElementById(id)) return;
 
     const sceneScopes = (SCENE_IDS || [])
       .map((s) => `#kn-${s}`)
       .join(', ');
     const S = sceneScopes || '';
 
-    // ---------- THEME TOKENS ----------
-    const L1 = {
-      fontSize: '18px',
-      fontWeight: '200',
-      bg: '#07467c',
-      color: '#ffffff',
-      tdPadding: '8px 12px',
-      collapsedOpacity: '0.92',
-      textalign: 'left',
-    };
-
-    const L2 = {
-      fontSize: '15px',
-      fontWeight: '400',
-      bg: 'aliceblue',
-      color: '#07467c',
-      tdPadding: '10px 10px 10px 50px',
-      collapsedOpacity: '0.88',
-    };
-
     const css = `
       /* ===== Shared group header behavior ===== */
       ${S} tr.scw-group-header {
         cursor: pointer;
         user-select: none;
       }
       ${S} tr.scw-group-header .scw-collapse-icon {
         display: inline-block;
         width: 1.2em;
         text-align: center;
         margin-right: .35em;
         font-weight: 700;
       }
 
-      /* ===== LEVEL 1 (MDF / IDF) ===== */
-      ${S} .kn-table-group.kn-group-level-1.scw-group-header {
-        font-size: ${L1.fontSize};
-        font-weight: ${L1.fontWeight} !important;
-        background-color: ${L1.bg} !important;
-        color: ${L1.color} !important;
-        text-align: ${L1.textalign} !important;
+      /* =========================
+         1) GLOBAL SECTION HEADERS (KTL hide/show)
+      ========================= */
+      ${S} .ktlHideShowButton {
+        background: #07467c !important;
+        color: #fff !important;
+        font-weight: 650 !important;
+        border-radius: 10px !important;
+        padding: 10px 14px !important;
+        display: flex !important;
+        align-items: center !important;
+        justify-content: space-between !important;
+        width: 100% !important;
+        max-width: 100% !important;
+        box-sizing: border-box !important;
+        letter-spacing: 0.2px !important;
+      }
+
+      ${S} .ktlHideShowButton .ktlArrow {
+        position: absolute !important;
+        right: 14px !important;
+        top: 50% !important;
+        transform: translateY(-50%) !important;
+      }
+
+      ${S} .kn-view .view-header .kn-title {
+        margin-bottom: 10px !important;
+        width: 100% !important;
+        max-width: 100% !important;
+        display: block !important;
+      }
+
+      ${S} .kn-view .view-header {
+        width: 100% !important;
+        max-width: 100% !important;
+        display: block !important;
+        position: relative !important;
+      }
+
+      ${S} .ktlHideShowSection.ktlBoxWithBorder {
+        border: 1px solid rgba(0,0,0,.10) !important;
+        border-radius: 12px !important;
+        padding: 12px !important;
+        background: #ffffff !important;
       }
-      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td {
-        padding: ${L1.tdPadding} !important;
-        text-align: ${L1.textalign} !important;
+
+      ${S} .ktlArrow,
+      ${S} .ktlHideShowButton .ktlArrow {
+        color: rgba(255,255,255,.85) !important;
       }
-      ${S} .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed {
-        opacity: ${L1.collapsedOpacity};
+
+      /* =========================
+         2) TABLE BASELINE (calmer grid)
+      ========================= */
+      ${S} .kn-table {
+        border-radius: 12px !important;
+        overflow: hidden !important;
       }
-      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td,
-      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td * {
-        color: ${L1.color} !important;
+
+      ${S} .kn-table thead th {
+        background: #f2f5f8 !important;
+        color: #243447 !important;
+        font-weight: 650 !important;
+        border-bottom: 1px solid rgba(0,0,0,.10) !important;
       }
 
-      /* ===== LEVEL 2 (Bucket) ===== */
-      ${S} .kn-table-group.kn-group-level-2.scw-group-header {
-        font-size: ${L2.fontSize};
-        font-weight: ${L2.fontWeight} !important;
-        background-color: ${L2.bg} !important;
-        color: ${L2.color} !important;
+      ${S} .kn-table td,
+      ${S} .kn-table th {
+        border-color: rgba(0,0,0,.08) !important;
       }
-      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td {
-        padding: ${L2.tdPadding} !important;
+
+      ${S} .kn-table td {
+        color: #1f2d3d !important;
+        line-height: 1.35 !important;
       }
-      ${S} .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed {
-        opacity: ${L2.collapsedOpacity};
+
+      ${S} .kn-table tbody tr:nth-child(even) td {
+        background: #fafafa !important;
       }
-      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td,
-      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td * {
-        color: ${L2.color} !important;
+
+      ${S} .kn-table tbody tr:hover td {
+        background: #f1f7fc !important;
+      }
+
+      /* =========================
+         3) GROUP HEADER HIERARCHY (Knack grouped rows)
+      ========================= */
+      ${S} .kn-table-group > td {
+        border-top: 1px solid rgba(0,0,0,.10) !important;
+        border-bottom: 1px solid rgba(0,0,0,.10) !important;
+      }
+
+      ${S} tr.kn-table-group.kn-group-level-1,
+      ${S} tr.kn-table-group.kn-group-level-1 > td,
+      ${S} tr.kn-table-group.kn-group-level-1 > th,
+      ${S} tr.kn-table-group.kn-group-level-1 td,
+      ${S} tr.kn-table-group.kn-group-level-1 th {
+        background: #07467c !important;
+        color: #ffffff !important;
+        font-weight: 700 !important;
+        font-size: 1.05em !important;
+        padding-top: 12px !important;
+        padding-bottom: 12px !important;
+        border-left: 6px solid #07467c !important;
+      }
+
+      ${S} tr.kn-table-group.kn-group-level-2 > td,
+      ${S} tr.kn-table-group.kn-group-level-2 > th,
+      ${S} tr.kn-table-group.kn-group-level-2 td,
+      ${S} tr.kn-table-group.kn-group-level-2 th {
+        background: #eef4f9 !important;
+        color: #1f2d3d !important;
+        font-weight: 600 !important;
+        font-size: 0.98em !important;
+        padding-top: 10px !important;
+        padding-bottom: 10px !important;
+        border-left: 6px solid #9fc0de !important;
+      }
+
+      ${S} .kn-table-group.kn-group-level-3 > td {
+        background: #f6f8fb !important;
+        color: #2b3a4a !important;
+        font-weight: 600 !important;
+        font-size: 0.95em !important;
+        border-left: 6px solid #d7e3ee !important;
+      }
+
+      ${S} .kn-table-group.kn-group-level-4 > td {
+        background: #fbfcfe !important;
+        color: #2b3a4a !important;
+        font-weight: 600 !important;
+        font-size: 0.93em !important;
+        border-left: 6px solid #e9f0f7 !important;
+      }
+
+      ${S} tr.scw-group-header.kn-group-level-1 > td {}
+      ${S} tr.scw-group-header.kn-group-level-2 > td {}
+
+      /* =========================
+         5) OPTIONAL: Collapsed/expanded affordance
+      ========================= */
+      ${S} .scw-group-header.is-expanded > td {
+        box-shadow: inset 0 0 0 1px rgba(255,255,255,.18) !important;
+      }
+
+      ${S} .scw-group-header.is-collapsed > td {
+        opacity: 0.95 !important;
       }
     `;
 
     const style = document.createElement('style');
     style.id = id;
     style.appendChild(document.createTextNode(css));
     document.head.appendChild(style);
   }
 
   // ======================
   // GROUP ROW HELPERS
   // ======================
   const GROUP_ROW_SEL =
     'tr.kn-table-group.kn-group-level-1, tr.kn-table-group.kn-group-level-2';
 
   function getGroupLevel($tr) {
     return $tr.hasClass('kn-group-level-2') ? 2 : 1;
   }
 
   function ensureIcon($tr) {
     const $cell = $tr.children('td,th').first();
     if (!$cell.find('.scw-collapse-icon').length) {
       $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">▼</span>');
     }
   }
@@ -155,50 +246,52 @@
   // 🔑 LEVEL-AWARE ROW COLLECTION (THIS IS THE BIG FIX)
   function rowsUntilNextRelevantGroup($headerRow) {
     const isLevel2 = $headerRow.hasClass('kn-group-level-2');
     let $rows = $();
 
     $headerRow.nextAll('tr').each(function () {
       const $tr = $(this);
 
       if (isLevel2) {
         if ($tr.hasClass('kn-table-group')) return false;
         $rows = $rows.add($tr);
         return;
       }
 
       // Level 1: stop only at NEXT Level 1
       if ($tr.hasClass('kn-group-level-1')) return false;
 
       $rows = $rows.add($tr);
     });
 
     return $rows;
   }
 
   function setCollapsed($header, collapsed) {
     $header.toggleClass('scw-collapsed', collapsed);
+    $header.toggleClass('is-collapsed', collapsed);
+    $header.toggleClass('is-expanded', !collapsed);
     $header.find('.scw-collapse-icon').text(collapsed ? '▶' : '▼');
     rowsUntilNextRelevantGroup($header).toggle(!collapsed);
   }
 
   // ======================
   // SCENE DETECTION
   // ======================
   function getCurrentSceneId() {
     const bodyId = $('body').attr('id');
     if (bodyId && bodyId.includes('scene_')) {
       const m = bodyId.match(/scene_\d+/);
       if (m) return m[0];
     }
     const $fallback = $('[id*="scene_"]').filter(':visible').first();
     if ($fallback.length) {
       const m = ($fallback.attr('id') || '').match(/scene_\d+/);
       if (m) return m[0];
     }
     return null;
   }
 
   function isEnabledScene(sceneId) {
     return !!sceneId && SCENE_IDS.includes(sceneId);
   }
 
@@ -279,26 +372,25 @@
 
   // ======================
   // INIT
   // ======================
   injectCssOnce();
   bindClicksOnce();
 
   SCENE_IDS.forEach((sceneId) => {
     $(document)
       .off(`knack-scene-render.${sceneId}${EVENT_NS}`)
       .on(`knack-scene-render.${sceneId}${EVENT_NS}`, function () {
         enhanceAllGroupedGrids(sceneId);
         startObserverForScene(sceneId);
       });
   });
 
   const initialScene = getCurrentSceneId();
   if (isEnabledScene(initialScene)) {
     enhanceAllGroupedGrids(initialScene);
     startObserverForScene(initialScene);
   }
 })();
 
 
 /*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
-
