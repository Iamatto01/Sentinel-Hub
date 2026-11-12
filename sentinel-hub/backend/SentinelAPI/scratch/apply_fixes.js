const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../index.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Clean mojibake lines
html = html.replace(
  'Enter your Sentinel API Key in the box below â€” the JSON code will update with your key in real time!',
  'Enter your Sentinel API Key in the box below &mdash; the JSON code will update with your key in real time!'
);

html = html.replace(
  '<span class="hidden sm:inline">Continue (config.json) â€” All AI Models</span>',
  '<span class="hidden sm:inline">Continue (config.json) &mdash; All AI Models</span>'
);

html = html.replace(
  "Don't have an API Key? Buy here â†—",
  "Don't have an API Key? Buy here &nearr;"
);

html = html.replace(
  '<li class="flex items-center gap-2"><span class="text-emerald-400">âœ“</span> <strong id="waTokensCount">100,000,000</strong> Full Token Quota</li>',
  '<li class="flex items-center gap-2"><span class="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span> <strong id="waTokensCount">100,000,000</strong> Full Token Quota</li>'
);

html = html.replace(
  '<li class="flex items-center gap-2"><span class="text-emerald-400">âœ“</span> Access all AI Models (DeepSeek, GLM, Kimi)</li>',
  '<li class="flex items-center gap-2"><span class="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span> Access all AI Models (DeepSeek, GLM, Kimi)</li>'
);

html = html.replace(
  '<li class="flex items-center gap-2"><span class="text-emerald-400">âœ“</span> Personal Live Quota Check Dashboard</li>',
  '<li class="flex items-center gap-2"><span class="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span> Personal Live Quota Check Dashboard</li>'
);

html = html.replace(
  '<li class="flex items-center gap-2"><span class="text-emerald-400">âœ“</span> No hidden charges or commitments</li>',
  '<li class="flex items-center gap-2"><span class="material-symbols-outlined text-emerald-400 text-[16px]">check_circle</span> No hidden charges or commitments</li>'
);

html = html.replace(
  '<span>Send Order via WhatsApp Now â†—</span>',
  '<span>Send Order via WhatsApp Now &nearr;</span>'
);

html = html.replace(
  '<span>â€¢</span>',
  '<span>&bull;</span>'
);

html = html.replace(
  '<p>Â© 2025â€“2026 Sentinel API Gateway. All Rights Reserved.</p>',
  '<p>&copy; 2025&ndash;2026 Sentinel API Gateway. All Rights Reserved.</p>'
);

// 2. Add id="waPlanValidity" and default text
html = html.replace(
  '<span class="px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-mono text-[11px] border border-emerald-400/30 font-semibold">14 - 28 Days Validity</span>',
  '<span id="waPlanValidity" class="px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-400 font-mono text-[11px] border border-emerald-400/30 font-semibold">21 Days Validity</span>'
);

// 3. Update selectTierAndScrollWhatsApp function
const oldSelectTier = `    // Dynamic Package Selector for WhatsApp Flow
    function selectTierAndScrollWhatsApp(title, tokens, price) {
      document.getElementById('waPackageTitle').textContent = \`\${title} (\${tokens})\`;
      document.getElementById('waPackagePrice').textContent = price;
      document.getElementById('waTokensCount').textContent = tokens;

      const rawMsg = \`Hi admin, I would like to buy the \${title} (\${tokens}) for \${price} from Sentinel API. Could I get your bank account / DuitNow details?\`;
      document.getElementById('waMessagePreview').textContent = rawMsg;

      const encoded = encodeURIComponent(rawMsg);
      document.getElementById('btnWhatsAppSubmit').href = \`https://wa.me/\${WA_NUMBER}?text=\${encoded}\`;

      // Smooth scroll to checkout station
      document.getElementById('checkout').scrollIntoView({ behavior: 'smooth' });
    }`;

const newSelectTier = `    // Dynamic Package Selector for WhatsApp Flow
    function selectTierAndScrollWhatsApp(title, tokens, price, validity = '21 Hari') {
      document.getElementById('waPackageTitle').textContent = \`\${title} (\${tokens})\`;
      document.getElementById('waPackagePrice').textContent = price;
      document.getElementById('waTokensCount').textContent = tokens;

      const valBadge = document.getElementById('waPlanValidity');
      if (valBadge) valBadge.textContent = \`\${validity} Validity\`;

      const rawMsg = \`Hi admin, I would like to buy the \${title} (\${tokens}) with \${validity} validity for \${price} from Sentinel API. Could I get your bank account / DuitNow details?\`;
      document.getElementById('waMessagePreview').textContent = rawMsg;

      const encoded = encodeURIComponent(rawMsg);
      document.getElementById('btnWhatsAppSubmit').href = \`https://wa.me/\${WA_NUMBER}?text=\${encoded}\`;

      // Smooth scroll to checkout station
      document.getElementById('checkout').scrollIntoView({ behavior: 'smooth' });
    }`;

if (html.includes(oldSelectTier)) {
  html = html.replace(oldSelectTier, newSelectTier);
  console.log('Successfully replaced selectTierAndScrollWhatsApp');
} else {
  console.warn('Warning: oldSelectTier exact match not found!');
}

// 4. Update currentAvailability and setAvailabilityFilter
const oldVarDec = `    let currentCategory = 'all';
    let isSyncing = false;`;

const newVarDec = `    let currentAvailability = 'available'; // 'available' or 'outofstock'
    let currentCategory = 'all';
    let isSyncing = false;

    function setAvailabilityFilter(status, button) {
      currentAvailability = status;
      const btnAvail = document.getElementById('btnTabAvailable');
      const btnOutOfStock = document.getElementById('btnTabOutOfStock');
      
      if (status === 'available') {
        if (btnAvail) {
          btnAvail.className = 'avail-tab px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/10 transition-all active:scale-95';
        }
        if (btnOutOfStock) {
          btnOutOfStock.className = 'avail-tab px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-white border border-white/10 font-mono text-xs font-semibold flex items-center gap-2 transition-all active:scale-95';
        }
      } else {
        if (btnAvail) {
          btnAvail.className = 'avail-tab px-4 py-2 rounded-xl bg-white/5 text-slate-400 hover:text-white border border-white/10 font-mono text-xs font-semibold flex items-center gap-2 transition-all active:scale-95';
        }
        if (btnOutOfStock) {
          btnOutOfStock.className = 'avail-tab px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/10 transition-all active:scale-95';
        }
      }
      filterModelCards();
    }`;

if (html.includes(oldVarDec)) {
  html = html.replace(oldVarDec, newVarDec);
  console.log('Successfully added currentAvailability and setAvailabilityFilter');
} else {
  console.warn('Warning: oldVarDec not found!');
}

// 5. Update loadModels badges
const oldBadgeUpdate = `          const activeModels = allActiveModels.filter(m => m.available !== false && m.enabled !== false);
          const activeCount = activeModels.length;
          const totalCount = allActiveModels.length;

          // Update header and telemetry indicators
          const catCount = document.getElementById('modelsCatalogCount');
          if (catCount) catCount.textContent = \`\${activeCount} Active / \${totalCount} Total\`;

          const heroMod = document.getElementById('heroModelsDisplay');
          if (heroMod) heroMod.textContent = \`\${activeCount} Active\`;`;

const newBadgeUpdate = `          const activeModels = allActiveModels.filter(m => m.available !== false && m.enabled !== false);
          const outOfStockModels = allActiveModels.filter(m => m.available === false || m.enabled === false);
          const activeCount = activeModels.length;
          const outOfStockCount = outOfStockModels.length;
          const totalCount = allActiveModels.length;

          // Update header and telemetry indicators
          const availBadge = document.getElementById('availCountBadge');
          if (availBadge) availBadge.textContent = activeCount;

          const outOfStockBadge = document.getElementById('outOfStockCountBadge');
          if (outOfStockBadge) outOfStockBadge.textContent = outOfStockCount;

          const catCount = document.getElementById('modelsCatalogCount');
          if (catCount) catCount.textContent = \`\${activeCount} Active / \${totalCount} Total\`;

          const heroMod = document.getElementById('heroModelsDisplay');
          if (heroMod) heroMod.textContent = \`\${activeCount} Active\`;`;

if (html.includes(oldBadgeUpdate)) {
  html = html.replace(oldBadgeUpdate, newBadgeUpdate);
  console.log('Successfully updated loadModels badge updates');
} else {
  console.warn('Warning: oldBadgeUpdate not found!');
}

// 6. Update filterModelCards
const oldFilter = `    // Real-time Model Search & Category Filter
    function filterModelCards() {
      const q = (document.getElementById('modelSearchInput')?.value || '').toLowerCase().trim();
      let list = allActiveModels || [];

      if (currentCategory === 'active') {
        list = list.filter(m => m.available !== false && m.enabled !== false);
      } else if (currentCategory === 'deepseek') {
        list = list.filter(m => (m.id || '').toLowerCase().includes('deepseek'));
      } else if (currentCategory === 'glm') {
        list = list.filter(m => (m.id || '').toLowerCase().includes('glm'));
      } else if (currentCategory === 'kimi') {
        list = list.filter(m => (m.id || '').toLowerCase().includes('kimi'));
      } else if (currentCategory === 'gpt') {
        list = list.filter(m => {
          const id = (m.id || '').toLowerCase();
          return id.includes('gpt') || id.includes('claude') || id.includes('gemini');
        });
      } else if (currentCategory === 'vision') {
        list = list.filter(m => {
          const id = (m.id || '').toLowerCase();
          return m.vision || id.includes('vision') || id.includes('k3') || id.includes('mod');
        });
      } else if (currentCategory === 'coding') {
        list = list.filter(m => {
          const id = (m.id || '').toLowerCase();
          return id.includes('code') || id.includes('flash') || id.includes('pro');
        });
      }

      if (q) {
        list = list.filter(m => (m.id || '').toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q));
      }

      renderModelCards(list);
    }`;

const newFilter = `    // Real-time Model Search & Category Filter
    function filterModelCards() {
      const q = (document.getElementById('modelSearchInput')?.value || '').toLowerCase().trim();
      let list = allActiveModels || [];

      // 1. Filter by Availability tab (Gambar 1 BandelAI style)
      if (currentAvailability === 'available') {
        list = list.filter(m => m.available !== false && m.enabled !== false);
      } else if (currentAvailability === 'outofstock') {
        list = list.filter(m => m.available === false || m.enabled === false);
      }
      const totalForCurrentStatus = list.length;

      // 2. Filter by Category tab
      if (currentCategory === 'deepseek') {
        list = list.filter(m => (m.id || '').toLowerCase().includes('deepseek'));
      } else if (currentCategory === 'glm') {
        list = list.filter(m => (m.id || '').toLowerCase().includes('glm'));
      } else if (currentCategory === 'kimi') {
        list = list.filter(m => (m.id || '').toLowerCase().includes('kimi'));
      } else if (currentCategory === 'gpt') {
        list = list.filter(m => {
          const id = (m.id || '').toLowerCase();
          return id.includes('gpt') || id.includes('claude') || id.includes('gemini');
        });
      } else if (currentCategory === 'vision') {
        list = list.filter(m => {
          const id = (m.id || '').toLowerCase();
          return m.vision || id.includes('vision') || id.includes('k3') || id.includes('mod');
        });
      } else if (currentCategory === 'coding') {
        list = list.filter(m => {
          const id = (m.id || '').toLowerCase();
          return id.includes('code') || id.includes('flash') || id.includes('pro');
        });
      }

      // 3. Filter by search query
      if (q) {
        list = list.filter(m => (m.id || '').toLowerCase().includes(q) || (m.desc || '').toLowerCase().includes(q));
      }

      // 4. Update Showing summary text (e.g. Showing 25 of 25 models)
      const showingCountEl = document.getElementById('showingCountNum');
      const totalAvailEl = document.getElementById('totalAvailableNum');
      if (showingCountEl) showingCountEl.textContent = list.length;
      if (totalAvailEl) totalAvailEl.textContent = totalForCurrentStatus;

      renderModelCards(list);
    }`;

if (html.includes(oldFilter)) {
  html = html.replace(oldFilter, newFilter);
  console.log('Successfully updated filterModelCards');
} else {
  console.warn('Warning: oldFilter not found!');
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('Saved index.html successfully!');
