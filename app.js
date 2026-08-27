const WORKER_URL = 'https://noisy-voice-0c5b.mohammedmila022.workers.dev';
let SESSION_TOKEN = null;
let currentAccessCode = null;
let accessData = null;

// ═══════════════════════════════════════════════════
// HELPERS (unchanged logic)
// ═══════════════════════════════════════════════════
function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += char; }
    }
    result.push(current.trim());
    return result;
}

function extractBsrNumber(bsrString) {
    if (!bsrString) return 99999999;
    const m = bsrString.replace(/,/g, '').match(/\d+/);
    return m ? parseInt(m[0]) : 99999999;
}

function cleanBsrDisplay(bsrString) {
    if (!bsrString) return 'N/A';
    return bsrString.replace(/ in Clothing, Shoes & Jewelry/gi, '').replace(/ in .+$/i, '').trim();
}

function parseDateFromString(dateString) {
    if (!dateString) return null;
    const c = dateString.replace(/^:\s*/, '').replace(/\u200e/g, '').trim();
    const dt = new Date(c);
    return isNaN(dt) ? null : dt;
}

function formatDate(date) {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const STOP_WORDS = new Set(['a','an','the','and','or','but','for','of','with','without','by','to','in','on','at','from','up','down','is','are','was','were','be','been','being','have','has','had','do','does','did','so','if','then','when','where','which','while','who','whom','this','that','these','those','no','not','just','very','too','than','over','more','out','as','its','it','i','my','your','our','their','his','her','we','they','me','him','us','them','what','how','all','any','each','few','some','such','into','about','after','before','between','during','off','shirt','shirts','tshirt','tshirts','tee','tees','tank','top','tops','hoodie','hoodies','pullover','sweatshirt','crewneck','vneck','sleeve','sleeves','short','long','graphic','design','printed','print','men','women','man','woman','male','female','boy','girl','boys','girls','kids','adult','adults','unisex','youth','toddler','infant','baby','clothing','wear','apparel','fashion','style','outfit','product','item','merchandise','merch','gift','gifts','present','presents','idea','ideas','great','perfect','best','good','nice','beautiful','pretty','funny','cool','cute','awesome','amazing','unique','original','vintage','retro','classic','new','old','modern','trendy','brand','made','quality','premium','official','licensed','100','cotton','polyester','blend','machine','wash','dry','lightweight','comfortable','comfort','soft','casual','fit','fitted','novelty','humor','humorous','sarcastic','sarcasm','quote','saying','slogan','text','word','words','team','group','crew','squad','club','family','member','members','love','lover','lovers','fan','fans','enthusiast','enthusiasts','life','lifestyle','living','co','inc','llc','ltd','us','uk','ca','usa','america','side','see','soon','day','days','year','years','time']);

function stem(w) {
    if (!w || w.length < 4) return w;
    w = w.replace(/ies$/, 'y').replace(/([^aeiou])s$/, '$1').replace(/ing$/, '').replace(/edly$/, '').replace(/ed$/, '').replace(/er$/, '');
    return w.length >= 2 ? w : w + 'e';
}

function cleanTokens(t) {
    if (!t) return [];
    return t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(w => w.length >= 2 && !/^\d+$/.test(w) && !STOP_WORDS.has(w) && !STOP_WORDS.has(stem(w))).map(w => stem(w));
}

function keywordMatchNormal(p, kw) {
    if (!kw?.trim()) return true;
    const tokens = kw.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').split(' ').filter(t => t);
    if (!tokens.length) return true;
    const txt = [p.designTitle, p.brand, p.featureBullet1, p.featureBullet2].join(' ').toLowerCase().replace(/[^\w\s]/g, ' ');
    return tokens.every(t => txt.includes(t));
}

function keywordMatchExact(p, kw) {
    if (!kw?.trim()) return true;
    const n = kw.trim().toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return true;
    const h = [p.designTitle, p.brand, p.featureBullet1, p.featureBullet2].join(' ').toLowerCase().replace(/[^\w\s]/g, ' ');
    return new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(h);
}

function keywordMatch(p, kw) {
    return (document.getElementById('searchMode')?.value === 'exact') ? keywordMatchExact(p, kw) : keywordMatchNormal(p, kw);
}

function extractLongTailByLength(title, n) {
    if (!title || n < 2) return [];
    const t = cleanTokens(title);
    if (t.length < n) return [];
    const s = new Set();
    for (let i = 0; i <= t.length - n; i++) { s.add(t.slice(i, i + n).join(' ')); }
    return [...s];
}

function calculateHotNiches(wl, pd, mr) {
    let prods = allProducts;
    if (pd > 0) {
        const cut = new Date();
        cut.setDate(cut.getDate() - pd);
        prods = prods.filter(p => p.parsedDate && p.parsedDate >= cut);
    }
    const freq = new Map(), bsrM = new Map(), titleM = new Map();
    prods.forEach(p => {
        const ph = extractLongTailByLength(p.designTitle, wl);
        const seen = new Set();
        ph.forEach(x => {
            if (seen.has(x)) return;
            seen.add(x);
            freq.set(x, (freq.get(x) || 0) + 1);
            if (!bsrM.has(x)) bsrM.set(x, []);
            bsrM.get(x).push(p.bsrNumber);
            if (!titleM.has(x)) titleM.set(x, p.designTitle);
        });
    });
    return [...freq.entries()].map(([kw, count]) => {
        const b = bsrM.get(kw) || [];
        return { keyword: kw, count, avgBSR: Math.round(b.reduce((a, x) => a + x, 0) / b.length), minBSR: Math.min(...b), exampleTitle: titleM.get(kw) || '' };
    }).filter(n => n.count >= mr).sort((a, b) => b.count - a.count || a.avgBSR - b.avgBSR).slice(0, 50);
}

// ═══════════════════════════════════════════════════
// WORKER API (Ultra-light)
// ═══════════════════════════════════════════════════
async function callWorker(endpoint, method = 'GET', body = null) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (SESSION_TOKEN) headers['X-Session-Token'] = SESSION_TOKEN;
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(`${WORKER_URL}${endpoint}`, options);
        return await response.json();
    } catch (error) { return { success: false, message: 'Connection error' }; }
}

async function validateAccessCode(code) {
    const result = await callWorker('/validateCode', 'POST', { code: String(code).toUpperCase() });
    if (!result.success) return null;
    return { code: String(code).toUpperCase(), expiryDate: result.expiryDate, status: result.status, valid: result.valid };
}

async function fetchProductsFromWorker() {
    const result = await callWorker('/fetchProducts', 'GET');
    if (!result.success || !result.data) throw new Error('Failed to fetch products');
    const lines = result.data.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Empty data');
    return lines.slice(1).map(l => {
        const c = parseCSVRow(l);
        if (c.length < 5) return null;
        return { asin: c[0] || '', link: c[1] || '#', bsrRaw: c[2] || '', bsrNumber: extractBsrNumber(c[2]), bsrDisplay: cleanBsrDisplay(c[2]), imageUrl: c[3] || 'https://via.placeholder.com/300?text=No+Image', dateAddedRaw: c[4] || '', parsedDate: parseDateFromString(c[4]), designTitle: c[5] || '', brand: c[6] || '', featureBullet1: c[7] || '', featureBullet2: c[8] || '' };
    }).filter(Boolean);
}

// ═══════════════════════════════════════════════════
// ACCESS CONTROL
// ═══════════════════════════════════════════════════
function showError(message) {
    const errorMsg = document.getElementById('errorMsg');
    const errorText = document.getElementById('errorText');
    errorText.textContent = message;
    errorMsg.classList.add('show');
    document.getElementById('successMsg').classList.remove('show');
    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = false;
    document.getElementById('btnText').style.display = 'inline';
    document.getElementById('loadingSpinner').style.display = 'none';
}

async function verifyAccessCode() {
    const codeInput = document.getElementById('accessCode');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = document.getElementById('btnText');
    const spinner = document.getElementById('loadingSpinner');

    const code = codeInput.value.trim().toUpperCase();
    if (!code) { showError('Please enter an access code'); return; }

    loginBtn.disabled = true;
    btnText.style.display = 'none';
    spinner.style.display = 'block';
    document.getElementById('errorMsg').classList.remove('show');
    document.getElementById('successMsg').classList.remove('show');

    try {
        const entry = await validateAccessCode(code);
        if (!entry) { showError('Connection error. Please try again.'); return; }
        if (!entry.valid) {
            if (entry.status === 'revoked') { showError('This code has been revoked.'); return; }
            if (entry.status === 'unknown') { showError('Invalid access code'); return; }
            showError('This code has expired.'); return;
        }

        const create = await callWorker('/createToken', 'POST', { code });
        if (!create.success || !create.sessionToken) {
            showError('Failed to create session. Please try again.'); return;
        }

        currentAccessCode = code;
        accessData = { code, expiryDate: entry.expiryDate };
        SESSION_TOKEN = create.sessionToken;
        localStorage.setItem('merchToken', SESSION_TOKEN);
        localStorage.setItem('merchCode', code);
        localStorage.setItem('merchExpiry', entry.expiryDate || '');

        await showSuccess();
    } catch (err) { showError('Verification failed. Please try again.'); }
    finally { loginBtn.disabled = false; btnText.style.display = 'inline'; spinner.style.display = 'none'; }
}

async function showSuccess() {
    const sm = document.getElementById('successMsg');
    sm.classList.add('show');
    sm.querySelector('span').textContent = 'Access granted! Loading...';
    setTimeout(() => showMainApp(), 1000);
}

async function showMainApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('mainApp').classList.add('show');
    document.getElementById('currentCode').textContent = currentAccessCode;
    updateExpiryBadge();
    await initApp();
}

function updateExpiryBadge() {
    if (!accessData?.expiryDate) return;
    const exp = new Date(accessData.expiryDate);
    const daysLeft = Math.ceil((exp - new Date()) / (1000*60*60*24));
    const badge = document.getElementById('expiryBadge');
    const text = document.getElementById('expiryText');
    if (daysLeft <= 0) { badge.classList.add('expired'); text.textContent = 'Expired'; }
    else if (daysLeft <= 7) { badge.classList.add('expired'); text.textContent = `Expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`; }
    else { badge.classList.remove('expired'); text.textContent = `Expires in ${daysLeft} days`; }
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('merchToken');
        localStorage.removeItem('merchCode');
        localStorage.removeItem('merchExpiry');
        SESSION_TOKEN = null;
        currentAccessCode = null;
        accessData = null;
        location.reload();
    }
}

// ═══════════════════════════════════════════════════
// APP DATA & STATE
// ═══════════════════════════════════════════════════
let allProducts = [];
let filteredProducts = [];
let favorites = new Set();
let favoritesFilterActive = false;
let currentKeywordSearch = '';
let trendChart = null;
let currentWordLength = 3;

// ═══════════════════════════════════════════════════
// FAVORITES
// ═══════════════════════════════════════════════════
function loadFavorites() {
    const saved = localStorage.getItem('merchFavorites');
    if (saved) { try { favorites = new Set(JSON.parse(saved)); } catch (e) { favorites = new Set(); } }
    updateFavoritesUI();
}

function saveFavorites() { localStorage.setItem('merchFavorites', JSON.stringify([...favorites])); updateFavoritesUI(); }

function cleanOrphanedFavorites() {
    if (!allProducts.length) return;
    const asinSet = new Set(allProducts.map(p => p.asin));
    let changed = false;
    for (const asin of [...favorites]) { if (!asinSet.has(asin)) { favorites.delete(asin); changed = true; } }
    if (changed) saveFavorites();
}

function toggleFavorite(asin) {
    if (!asin) return;
    if (favorites.has(asin)) favorites.delete(asin); else favorites.add(asin);
    saveFavorites();
    if (favoritesFilterActive) applyAllFilters();
    else {
        const isFav = favorites.has(asin);
        document.querySelectorAll('.favorite-btn[data-asin="' + CSS.escape(asin) + '"]').forEach(btn => {
            btn.classList.toggle('active', isFav);
            const icon = btn.querySelector('i');
            if (icon) icon.className = isFav ? 'fas fa-heart' : 'far fa-heart';
        });
    }
}

function isFavorite(asin) { return favorites.has(asin); }

function updateFavoritesUI() {
    const count = favorites.size;
    document.getElementById('favoritesCount').textContent = count;
    const toggleBtn = document.getElementById('favoritesToggleBtn');
    const indicator = document.getElementById('favoritesActiveIndicator');
    const exportBtn = document.getElementById('exportCsvBtn');
    if (favoritesFilterActive) { toggleBtn.classList.add('active'); toggleBtn.querySelector('i').className = 'fas fa-heart'; indicator.style.display = 'inline-flex'; }
    else { toggleBtn.classList.remove('active'); toggleBtn.querySelector('i').className = 'far fa-heart'; indicator.style.display = 'none'; }
    exportBtn.disabled = count === 0;
}

function toggleFavoritesFilter() { favoritesFilterActive = !favoritesFilterActive; updateFavoritesUI(); applyAllFilters(); }

function exportFavoritesToCSV() {
    if (favorites.size === 0) { showToast('No favorites to export'); return; }
    const favProducts = allProducts.filter(p => favorites.has(p.asin));
    if (favProducts.length === 0) { showToast('No favorite products found in current data'); return; }
    const headers = ['ASIN', 'Title', 'BSR', 'Date Added', 'Link'];
    const rows = favProducts.map(p => [p.asin, `"${(p.designTitle || '').replace(/"/g, '""')}"`, p.bsrDisplay, p.dateAddedRaw, p.link]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `merch_favorites_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✅ Exported ${favProducts.length} favorites`);
}

function showToast(message) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ═══════════════════════════════════════════════════
// AMAZON RESEARCH
// ═══════════════════════════════════════════════════
function openResearchModal() { document.getElementById('researchModal').classList.add('active'); }
function closeResearchModal() { document.getElementById('researchModal').classList.remove('active'); }

const researchUrls = {
    com: {
        tshirt: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+shirt&=most-purchased-rank',
        longsleeve: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+long+sleeve&=most-purchased-rank',
        sweatshirt: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+sweatshirt&=most-purchased-rank',
        hoodie: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+hoodie&=most-purchased-rank',
        vneck: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+v+neck&=most-purchased-rank',
        raglan: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+raglan&=most-purchased-rank',
        tanktop: 'https://www.amazon.com/s?i=fashion-novelty&bbn=12035955011&rh=p_6%3AATVPDKIKX0DER&s&hidden-keywords=SEARCHTERM+tank+top&=most-purchased-rank',
        popsocket: 'https://www.amazon.com/s?k=SEARCHTERM+%22popsockets%22',
        case: 'https://www.amazon.com/s?k=SEARCHTERM+%22Two-part+protective+case%22',
        throwpillow: 'https://www.amazon.com/s?k=SEARCHTERM+throw+pillow+%22100%25+spun+polyester%22',
        totebag: 'https://www.amazon.com/s?k=SEARCHTERM+%22Tote+Bag%22'
    },
    couk: {
        tshirt: 'https://www.amazon.co.uk/s?k=SEARCHTERM+shirt&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        longsleeve: 'https://www.amazon.co.uk/s?k=SEARCHTERM+long+sleeve&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        sweatshirt: 'https://www.amazon.co.uk/s?k=SEARCHTERM+sweatshirt&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        hoodie: 'https://www.amazon.co.uk/s?k=SEARCHTERM+hoodie&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        raglan: 'https://www.amazon.co.uk/s?k=SEARCHTERM+raglan&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        vneck: 'https://www.amazon.co.uk/s?k=SEARCHTERM+v+neck&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        tanktop: 'https://www.amazon.co.uk/s?k=SEARCHTERM+tank+top&rh=n%3A11961407031%2Cp_6%3AA3P5ROKL5A1OLE',
        popsocket: 'https://www.amazon.co.uk/s?k=SEARCHTERM+%22popsockets%22',
        case: 'https://www.amazon.co.uk/s?k=SEARCHTERM+phone+case&rh=n%3A560798%2Cp_6%3AA3P5ROKL5A1OLE'
    },
    de: {
        tshirt: 'https://www.amazon.de/s?k=SEARCHTERM+shirt&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        vneck: 'https://www.amazon.de/s?k=SEARCHTERM+v+neck&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        longsleeve: 'https://www.amazon.de/s?k=SEARCHTERM+langarmshirt&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        sweatshirt: 'https://www.amazon.de/s?k=SEARCHTERM+sweatshirt&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        hoodie: 'https://www.amazon.de/s?k=SEARCHTERM+hoodie&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        popsocket: 'https://www.amazon.de/s?k=SEARCHTERM+%22popsockets%22',
        raglan: 'https://www.amazon.de/s?k=SEARCHTERM+raglan&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        tanktop: 'https://www.amazon.de/s?k=SEARCHTERM+tank+top&rh=n%3A11961464031%2Cp_6%3AA3JWKAKR8XB7XF',
        case: 'https://www.amazon.de/s?k=SEARCHTERM+H%C3%BClle+phone&rh=n%3A562066%2Cp_6%3AA3JWKAKR8XB7XF'
    }
};

function performAmazonSearch() {
    const locale = document.getElementById('researchLocale').value;
    const category = document.getElementById('researchCategory').value;
    const keyword = document.getElementById('researchKeyword').value.trim();
    const urlTemplate = researchUrls[locale]?.[category];
    if (!urlTemplate) { showToast('This category is not available for that marketplace'); return; }
    const searchTerm = keyword ? encodeURIComponent(keyword) : '';
    window.open(urlTemplate.replace('SEARCHTERM', searchTerm), '_blank');
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
async function initApp() {
    if (!SESSION_TOKEN) {
        document.getElementById('productsContainer').innerHTML = '<div class="no-results">⚠️ Session error. Please logout and login again.</div>';
        return;
    }
    loadFavorites();
    setupEventDelegation();
    await loadProducts();
    cleanOrphanedFavorites();
    renderProducts(allProducts);
    updateTrendChart();
    renderHotNiches();
}

async function loadProducts() {
    try {
        const container = document.getElementById('productsContainer');
        container.innerHTML = '<div class="loading">Loading products...</div>';
        allProducts = await fetchProductsFromWorker();
        allProducts.sort((a, b) => {
            if (!a.parsedDate && !b.parsedDate) return 0;
            if (!a.parsedDate) return 1;
            if (!b.parsedDate) return -1;
            return b.parsedDate - a.parsedDate;
        });
        document.getElementById('product-count').textContent = allProducts.length;
        filteredProducts = [...allProducts];
    } catch (error) {
        document.getElementById('productsContainer').innerHTML = '<div class="no-results">⚠️ Failed to load products. Please try again later.</div>';
    }
}

// ═══════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════
function applyAllFilters() {
    const kw = document.getElementById('keywordSearch')?.value || '';
    const bMin = parseFloat(document.getElementById('bsrMin')?.value) || 0;
    const bMax = parseFloat(document.getElementById('bsrMax')?.value) || Infinity;
    const dF = document.getElementById('dateFilter')?.value || 'all';
    const sV = document.getElementById('sortSelect')?.value || 'date-desc';
    let f = allProducts.filter(p => {
        if (favoritesFilterActive && !isFavorite(p.asin)) return false;
        if (!keywordMatch(p, kw)) return false;
        if (p.bsrNumber < bMin || p.bsrNumber > bMax) return false;
        if (dF !== 'all' && p.parsedDate) {
            const d = (Date.now() - p.parsedDate) / (1000 * 3600 * 24);
            if (dF === 'today' && d > 1) return false;
            if (dF === 'week' && d > 7) return false;
            if (dF === 'month' && d > 30) return false;
        }
        return true;
    });
    f.sort((a, b) => {
        if (sV === 'date-desc') return (b.parsedDate || 0) - (a.parsedDate || 0);
        if (sV === 'date-asc') return (a.parsedDate || 0) - (b.parsedDate || 0);
        if (sV === 'bsr-asc') return a.bsrNumber - b.bsrNumber;
        if (sV === 'bsr-desc') return b.bsrNumber - a.bsrNumber;
        return 0;
    });
    filteredProducts = f;
    renderProducts(f);
}

function resetAll() {
    ['keywordSearch', 'bsrMin', 'bsrMax'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) dateFilter.value = 'all';
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'date-desc';
    const searchMode = document.getElementById('searchMode');
    if (searchMode) searchMode.value = 'normal';
    currentKeywordSearch = '';
    if (favoritesFilterActive) toggleFavoritesFilter();
    applyAllFilters();
}

// ═══════════════════════════════════════════════════
// EVENT DELEGATION
// ═══════════════════════════════════════════════════
function setupEventDelegation() {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    container.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        const asin = btn.getAttribute('data-asin');
        switch(action) {
            case 'favorite': e.preventDefault(); e.stopPropagation(); if (asin) toggleFavorite(asin); break;
            case 'analyze': e.preventDefault(); e.stopPropagation(); if (asin) analyzeProduct(asin); break;
            case 'external-link': e.stopPropagation(); break;
        }
    });
    const nichesContainer = document.getElementById('hotNichesContainer');
    if (nichesContainer) {
        nichesContainer.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const keyword = btn.getAttribute('data-keyword');
            switch(action) {
                case 'search-keyword': e.preventDefault(); if (keyword) searchByKeyword(keyword); break;
                case 'amazon-search': e.preventDefault(); e.stopPropagation(); if (keyword) openAmazonSearch(keyword); break;
            }
        });
    }
}

// ═══════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════
function renderProducts(products) {
    const container = document.getElementById('productsContainer');
    if (products.length === 0) { container.innerHTML = '<div class="no-results">📭 No products found matching your criteria</div>'; return; }
    document.getElementById('product-count').innerText = products.length;
    let html = '<div class="products-grid">';
    products.forEach(product => {
        const favActive = isFavorite(product.asin) ? 'active' : '';
        const favIcon = isFavorite(product.asin) ? 'fas fa-heart' : 'far fa-heart';
        const dateDisplay = product.parsedDate ? formatDate(product.parsedDate) : product.dateAddedRaw || 'N/A';
        html += `
            <div class="product-card">
                <button class="favorite-btn ${favActive}" data-action="favorite" data-asin="${escHtmlSafe(product.asin)}" title="Add to favorites">
                    <i class="${favIcon}"></i>
                </button>
                <img class="product-image" src="${product.imageUrl}" alt="${escHtmlSafe(product.designTitle) || 'Product'}" loading="lazy" data-fallback="https://via.placeholder.com/300?text=No+Image">
                <div class="product-info">
                    ${product.bsrDisplay ? `<div class="bsr-tag">📊 ${product.bsrDisplay}</div>` : ''}
                    <div class="product-title">${escHtmlSafe(product.designTitle) || 'Untitled Design'}</div>
                    ${product.brand ? `<div style="font-size:0.7rem;color:#64748b;margin-bottom:4px;">🏷️ ${escHtmlSafe(product.brand)}</div>` : ''}
                    <div class="product-date">📅 ${dateDisplay}</div>
                    <div class="card-actions">
                        <a href="${product.link}" target="_blank" class="amazon-btn" data-action="external-link">
                            <i class="fab fa-amazon"></i> Amazon
                        </a>
                        <a href="https://www.amazon.com/dp/${product.asin}" target="_blank" class="amazon-btn" data-action="external-link" style="flex:0.5;">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        <button class="analyze-btn" data-action="analyze" data-asin="${escHtmlSafe(product.asin)}">
                            <i class="fas fa-chart-line"></i> Analyze
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('img[data-fallback]').forEach(img => {
        img.addEventListener('error', function handler() { this.src = this.dataset.fallback; this.removeEventListener('error', handler); });
    });
}

function renderHotNiches() {
    const container = document.getElementById('hotNichesContainer');
    const pd = parseInt(document.getElementById('nichesPeriod')?.value || '7');
    const mr = Math.max(1, parseInt(document.getElementById('minRepeats')?.value || '2'));
    const niches = calculateHotNiches(currentWordLength, pd, mr);
    if (!niches.length) { container.innerHTML = '<div class="niche-item" style="text-align:center;color:#94a3b8;">No results</div>'; return; }
    const max = niches[0].count;
    container.innerHTML = niches.map((n, i) => {
        const bw = Math.round((n.count / max) * 100);
        const rc = i === 0 ? '#e95e2e' : i < 3 ? '#f59e0b' : i < 10 ? '#3b82f6' : '#64748b';
        return `<div class="niche-item" data-action="search-keyword" data-keyword="${escHtmlSafe(n.keyword)}">
            <div class="niche-main-row">
                <div class="niche-left">
                    <span class="niche-rank" style="background:${rc}22;color:${rc};">#${i + 1}</span>
                    <span class="niche-keyword" title="${escHtmlJS(n.exampleTitle)}">${escHtmlSafe(n.keyword)}</span>
                </div>
                <div class="niche-stats">
                    <span class="niche-count" style="background:${rc};">${n.count}×</span>
                    <span class="niche-bsr">avg:${n.avgBSR.toLocaleString()}</span>
                    <span class="niche-bsr">🏆${n.minBSR.toLocaleString()}</span>
                    <span class="niche-action">
                        <button class="amazon-search-btn" data-action="amazon-search" data-keyword="${escHtmlSafe(n.keyword)}">
                            <i class="fab fa-amazon"></i> Search
                        </button>
                    </span>
                </div>
            </div>
            <div class="niche-bar-bg">
                <div class="niche-bar-fill" style="width:${bw}%;background:${rc};"></div>
            </div>
        </div>`;
    }).join('');
}

function applyNicheControls() {
    const input = document.getElementById('wordLengthInput');
    let len = parseInt(input.value);
    if (isNaN(len)) len = 3;
    len = Math.max(2, Math.min(6, len));
    input.value = len;
    currentWordLength = len;
    renderHotNiches();
}

function openAmazonSearch(kw) { window.open(`https://www.amazon.com/s?k=${encodeURIComponent(kw)}`, '_blank'); }

function searchByKeyword(kw) {
    const i = document.getElementById('keywordSearch');
    if (i) { i.value = kw; currentKeywordSearch = kw; applyAllFilters(); document.querySelector('.keyword-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function escHtmlSafe(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escHtmlJS(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '\\n');
}

function analyzeProduct(asin) {
    const product = allProducts.find(p => p.asin === asin);
    if (!product) return;
    const modal = document.getElementById('analysisModal');
    const body = document.getElementById('modalBody');
    const allText = [product.designTitle, product.featureBullet1, product.featureBullet2, product.brand].filter(Boolean).join(' ').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    const wordFreq = {};
    allText.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
    const keywords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count }));
    const titleWords = (product.designTitle || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    let longtailPhrases = [];
    if (titleWords.length >= 3) { for (let i = 0; i <= titleWords.length - 3; i++) longtailPhrases.push(titleWords.slice(i, i + 3).join(' ')); }
    longtailPhrases = [...new Set(longtailPhrases)].slice(0, 5);
    const dd = product.parsedDate ? formatDate(product.parsedDate) : (product.dateAddedRaw ? product.dateAddedRaw.replace(/^:\s*/, '') : 'N/A');
    body.innerHTML = `
        <div style="text-align:center;">
            <img class="modal-img" src="${product.imageUrl}" alt="${escHtmlSafe(product.designTitle)}" data-fallback="https://via.placeholder.com/300?text=No+Image">
        </div>
        <div class="detail-block"><strong>📌 Title:</strong><br>${escHtmlSafe(product.designTitle) || '<em style="color:#94a3b8;">N/A</em>'}</div>
        <div class="detail-block"><strong>🏷️ Brand:</strong><br>${escHtmlSafe(product.brand) || '<em style="color:#94a3b8;">N/A</em>'}</div>
        <div class="detail-block"><strong>✨ Feature 1:</strong><br>${escHtmlSafe(product.featureBullet1) || '<em style="color:#94a3b8;">N/A</em>'}</div>
        <div class="detail-block"><strong>✨ Feature 2:</strong><br>${escHtmlSafe(product.featureBullet2) || '<em style="color:#94a3b8;">N/A</em>'}</div>
        <div class="detail-block"><strong>📊 BSR:</strong> ${product.bsrDisplay}<br><strong>📅 Date Added:</strong> ${dd}<br><strong>🔗 ASIN:</strong> ${product.asin}</div>
        <div class="detail-block"><strong>🔑 Top Keywords:</strong><div class="keyword-list">${keywords.length ? keywords.map(k => `<span class="keyword-badge">${escHtmlSafe(k.word)} (${k.count})</span>`).join('') : '<em style="color:#94a3b8;">None</em>'}</div></div>
        ${longtailPhrases.length > 0 ? `<div class="detail-block"><strong>🎯 Long-Tail Phrases:</strong><div class="keyword-list">${longtailPhrases.map(p => `<span class="keyword-badge longtail-badge">${escHtmlSafe(p)}</span>`).join('')}</div></div>` : ''}
        <hr style="margin:14px 0;border:none;border-top:1px solid #eef2f8;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a href="${product.link}" target="_blank" class="amazon-btn" style="flex:1;text-decoration:none;padding:10px;text-align:center;background:#ff9900;color:white;border-radius:40px;font-weight:600;"><i class="fab fa-amazon"></i> View on Amazon</a>
            <a href="https://www.amazon.com/dp/${product.asin}" target="_blank" class="amazon-btn" style="flex:1;text-decoration:none;padding:10px;text-align:center;background:#232f3e;color:white;border-radius:40px;font-weight:600;"><i class="fas fa-external-link-alt"></i> Direct Link</a>
        </div>
    `;
    modal.classList.add('active');
}

function closeModal() { document.getElementById('analysisModal').classList.remove('active'); }

function updateTrendChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const days = [], counts = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        days.push(d);
        const nextDay = new Date(d); nextDay.setDate(nextDay.getDate() + 1);
        counts.push(allProducts.filter(p => p.parsedDate && p.parsedDate >= d && p.parsedDate < nextDay).length);
    }
    const labels = days.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Products Added', data: counts, borderColor: '#667eea', backgroundColor: 'rgba(102, 126, 234, 0.1)', fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#667eea', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', titleColor: '#fff', bodyColor: '#fff', cornerRadius: 8, padding: 10 } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: '#f1f5f9' } }, x: { ticks: { font: { size: 10 }, maxRotation: 45 }, grid: { display: false } } } }
    });
}

// ═══════════════════════════════════════════════════
// INITIAL LOAD & EVENT BINDING
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('loginBtn').addEventListener('click', verifyAccessCode);
    document.getElementById('accessCode').addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyAccessCode(); });
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('researchBtn').addEventListener('click', openResearchModal);
    document.getElementById('closeResearchModalBtn').addEventListener('click', closeResearchModal);
    document.getElementById('researchModal').addEventListener('click', (e) => { if (e.target === document.getElementById('researchModal')) closeResearchModal(); });
    document.getElementById('researchSearchBtn').addEventListener('click', performAmazonSearch);
    document.getElementById('researchKeyword').addEventListener('keypress', (e) => { if (e.key === 'Enter') performAmazonSearch(); });
    document.getElementById('favoritesToggleBtn').addEventListener('click', toggleFavoritesFilter);
    document.getElementById('exportCsvBtn').addEventListener('click', exportFavoritesToCSV);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyAllFilters);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetAll);
    document.getElementById('searchKeywordBtn').addEventListener('click', () => { currentKeywordSearch = document.getElementById('keywordSearch').value.trim(); applyAllFilters(); });
    document.getElementById('clearKeywordBtn').addEventListener('click', () => { document.getElementById('keywordSearch').value = ''; currentKeywordSearch = ''; applyAllFilters(); });
    document.getElementById('keywordSearch').addEventListener('keypress', (e) => { if (e.key === 'Enter') { currentKeywordSearch = document.getElementById('keywordSearch').value.trim(); applyAllFilters(); } });
    document.getElementById('applyWordLengthBtn').addEventListener('click', applyNicheControls);
    document.getElementById('wordLengthInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') applyNicheControls(); });
    document.getElementById('nichesPeriod').addEventListener('change', renderHotNiches);
    document.getElementById('minRepeats').addEventListener('keypress', (e) => { if (e.key === 'Enter') applyNicheControls(); });
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('analysisModal').addEventListener('click', (e) => { if (e.target === document.getElementById('analysisModal')) closeModal(); });
    document.getElementById('sortSelect').addEventListener('change', applyAllFilters);
    document.getElementById('dateFilter').addEventListener('change', applyAllFilters);
    document.getElementById('searchMode').addEventListener('change', () => { if (currentKeywordSearch) applyAllFilters(); });
    document.getElementById('bsrMin').addEventListener('change', applyAllFilters);
    document.getElementById('bsrMax').addEventListener('change', applyAllFilters);
    document.getElementById('bsrMin').addEventListener('keypress', (e) => { if (e.key === 'Enter') applyAllFilters(); });
    document.getElementById('bsrMax').addEventListener('keypress', (e) => { if (e.key === 'Enter') applyAllFilters(); });

    // Ultra-light session restore (no periodic checks, no fingerprint)
    const savedToken = localStorage.getItem('merchToken');
    const savedCode = localStorage.getItem('merchCode');
    const savedExpiry = localStorage.getItem('merchExpiry');

    if (savedToken && savedCode) {
        if (savedExpiry && new Date(savedExpiry) < new Date()) {
            localStorage.removeItem('merchToken');
            localStorage.removeItem('merchCode');
            localStorage.removeItem('merchExpiry');
        } else {
            SESSION_TOKEN = savedToken;
            currentAccessCode = savedCode;
            accessData = { code: savedCode, expiryDate: savedExpiry };
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('mainApp').classList.add('show');
            document.getElementById('currentCode').textContent = currentAccessCode;
            updateExpiryBadge();
            await initApp();
        }
    }
});

window.toggleFavoritesFilter = toggleFavoritesFilter;
window.toggleFavorite = toggleFavorite;
window.exportFavoritesToCSV = exportFavoritesToCSV;
window.applyAllFilters = applyAllFilters;
window.resetAll = resetAll;
window.logout = logout;
window.openAmazonSearch = openAmazonSearch;
window.searchByKeyword = searchByKeyword;
window.verifyAccessCode = verifyAccessCode;
window.openResearchModal = openResearchModal;
window.closeResearchModal = closeResearchModal;
window.performAmazonSearch = performAmazonSearch;
