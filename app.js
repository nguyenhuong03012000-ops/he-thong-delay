/* 
  KSA Order Risk PRO V7.4 (SENSE-ALL ADDRESS AI) 🛡️🇸🇦🚀
  User Screen Match: 7566 Ar Rahmaniyah, CNMN3622, JESA/405...
  - STARTING NUMBERS: A 3-5 digit number at start = 100% SAFE (Plot Number).
  - DISTRICT PREFIXES: Al, Ar, An, As, Ash, At...
  - V7.1 SUGGESTION: Only suggest city in notes, NO auto-fill.
*/

async function runCheck() {
    setLoading(true);
    setStatus('V7.4 Syncing: Sense-All Address AI...');

    try {
        console.log('[V7.4] Syncing Links (Sense-All Heuristics)...');
        const [ordersData1, profilesData, ordersData2] = await Promise.all([
            fetchData(1), // JNT KSA (gid=589)
            fetchData(2), // PosSheets (gid=124)
            fetchData(3)  // JNT KSA-HLE
        ]);

        let ordersData = (ordersData1 || []).concat(ordersData2 || []);
        ordersData.headers = (ordersData1 && ordersData1.headers) ? ordersData1.headers :
            (ordersData2 && ordersData2.headers) ? ordersData2.headers : [];

        if (!ordersData || ordersData.length === 0) {
            setStatus('V7.4 Error: Data unavailable.');
            return;
        }

        setStatus(`V7.4 Analysis: ${ordersData.length} records...`);
        const results = processOrders(ordersData, profilesData);

        renderResults(results);

        // Final visibility fix
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('results').classList.remove('hidden');
        document.getElementById('statusArea').classList.add('hidden');

        setStatus(`V7.4 Ready: ${ordersData.length} records checked.`);
    } catch (error) {
        console.error('[V7.4 Error]', error);
        setStatus('V7.4 Sync Error: ' + error.message);
    } finally {
        setLoading(false);
    }
}

/** 
 * Universal 9-digit Saudi Phone Normalization (V7.6)
*/
function getMatchKey(p) {
    if (!p) return '';
    let clean = p.toString().replace(/[^0-9]/g, '');
    if (clean.length === 14 && clean.startsWith('009665')) return clean.substring(5);
    if (clean.length === 13 && clean.startsWith('09665')) return clean.substring(4);
    if (clean.length === 12 && clean.startsWith('9665')) return clean.substring(3);
    if (clean.length === 10 && clean.startsWith('05')) return clean.substring(1);
    if (clean.length === 9 && clean.startsWith('5')) return clean;
    return '';
}

const CITIES_SA = ["riyadh", "jeddah", "makkah", "medina", "dammam", "taif", "tabuk", "buraidah", "hail", "jizan", "najran", "abha", "arar", "sakaka", "bahah", "jubail", "yanbu", "khobar", "asir", "qassim", "sabya", "kharj", "unayzah", "qatif", "tabarjal", "dawadmi", "bish", "hofuf", "mubarraz", "khafji", "hafar al-batin", "hafar al batin", "thurwal", "rabigh", "yanbu al bahr", "majmaah", "zulfi", "al-ula", "sharurah", "qurayyat", "duwadimi", "bukayriyah", "badaya", "mithnab", "habuna", "bisha", "baljurashi", "namas", "khulays", "ranyah", "layla", "shakra", "sulayyil", "dawadmi", "dhahran", "taraib", "ras tanura", "tathlith", "waajh", "amluj", "qunfudhah", "layth", "rabigh", "khayber", "al ghazzal", "dumah al jandal", "turaif", "qaisumah", "rafha", "makhwah", "bariq", "majaridah", "samtah", "abu arish", "ahad masarihah", "damad", "aydabi", "baish", "darb"];

/** 
 * AUTO-SENSING COLUMN LOGIC (V7.4)
*/
function autoSenseColumns(rows) {
    const idx = { id: 1, phone: 3, city: 5, address: 6, cod: 14 };
    if (!rows || rows.length === 0) return idx;
    const row = rows[0];
    const keys = Object.keys(row);

    for (let k of keys) {
        if (getMatchKey(row[k])) { idx.phone = parseInt(k.split('_')[1]); break; }
    }
    for (let k of keys) {
        const val = (row[k] || '').toString().toLowerCase();
        if (CITIES_SA.some(c => val.includes(c)) && parseInt(k.split('_')[1]) !== idx.phone) {
            idx.city = parseInt(k.split('_')[1]);
            break;
        }
    }
    let maxLen = 0;
    for (let k of keys) {
        const i = parseInt(k.split('_')[1]);
        if (i === idx.phone || i === idx.city || i === 0 || i === 1) continue;
        const val = (row[k] || '').toString();
        if (val.length > maxLen) { maxLen = val.length; idx.address = i; }
    }
    for (let k of keys) {
        const i = parseInt(k.split('_')[1]);
        if (i === idx.phone || i === idx.city || i === idx.address) continue;
        const val = (row[k] || '').toString().replace(',', '.');
        const n = parseFloat(val);
        if (!isNaN(n) && n >= 10 && n < 5000) { idx.cod = i; break; }
    }
    idx.id = 1;
    return idx;
}

/** 
 * AI CITY RECOVERY (V7.4)
*/
function suggestCityAI(address) {
    if (!address) return null;
    const addrLow = address.toLowerCase();
    for (let city of CITIES_SA) {
        if (addrLow.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
    }
    return null;
}

/** 
 * SENSE-ALL HIGH-PRECISION ADDRESS ANALYSIS ENGINE (V7.4)
*/
function evaluateAddress(address, city) {
    if (!address) return { isRisk: true, reasons: ["Địa chỉ trống"], notes: [] };
    const addrLow = address.trim().toLowerCase();

    // 1. Plot Number Sensing: Starts with 3-5 digits (e.g., 7566 Ar Rahmaniyah)
    const startsWithPlotNumber = /^[0-9]{3,5}/.test(address.trim());
    const hasNumericCode = /\d{4,5}/.test(addrLow);

    // 2. District & Prefix Sensing
    const hasSA_Prefix = /(al|ar|an|as|ash|at|ad|az|al-|ar-|an-)\s[a-z]{3,}/i.test(addrLow);
    const hasHouseInfo = /(house|no\.|no\s|villa|vila|home|bldg|building|room|unit|floor|apt|apartment|flat|makhzin|warehouse)/i.test(addrLow);
    const hasBusinessInfo = /(store|farm|shop|market|pharmacy|center|clinic|hospital|airport|electricity|company|office|hq|tower|villa)/i.test(addrLow);

    // 3. National Address Support (CNMN3622 or JESA/405)
    const isNationalAddress = /[A-Z]{4}\d{4}/i.test(address) || /[A-Z]{4}\/\d{3}/i.test(address) || /\b[A-Z]{1,3}\d{1,4}\b/.test(address);

    // 4. Ultimate Precision Decision (V7.4)
    // If it starts with a Plot number and has a district prefix, it's 100% Reliable.
    const isReliable = isNationalAddress || startsWithPlotNumber || (hasSA_Prefix && hasNumericCode) || hasHouseInfo || hasBusinessInfo;

    const notes = [];
    if (isNationalAddress) notes.push("🇸🇦 National Address Match");
    if (startsWithPlotNumber) notes.push("🔢 Start with Plot Number");
    if (hasSA_Prefix) notes.push("🏘️ District prefix detected");
    if (hasBusinessInfo) notes.push("🏠 Business/Location info");

    const errors = [];
    if (!city || city.length < 2) errors.push("Thiếu thành phố");
    if (!isReliable && address.length < 15) errors.push("Địa chỉ mập mờ");
    if (!isReliable) errors.push("Thiếu chi tiết (Khách lạ)");

    return {
        isRisk: errors.length > 0,
        reasons: errors,
        notes: notes,
        isReliable: isReliable
    };
}

/** 
 * CORE LOGIC ENGINE (V7.4)
*/
function processOrders(orders, profiles) {
    const ready = [];
    const risk = [];

    // Map Profiles (Link 2) - Auto-detect grouped vs raw list
    const profileMap = new Map();

    // Auto-detect if user pasted a RAW list of orders instead of the aggregated POS summary
    let isRawList = false;
    for (let i = 0; i < Math.min(10, profiles.length); i++) {
        const rowStr = Object.values(profiles[i]).join(' ').toLowerCase();
        if (rowStr.match(/(returned|delivered|đã nhận|đã hoàn|đang hoàn|hoàn|returning|canceled|hủy)/)) {
            isRawList = true;
            break;
        }
    }

    if (isRawList) {
        // Raw list logic: count occurrences of phone
        profiles.forEach(p => {
            let phoneStr = "";
            let statusStr = "";

            Object.values(p).forEach(val => {
                const s = val.toString().trim();
                const mkRaw = getMatchKey(s);
                if (mkRaw && !phoneStr) phoneStr = mkRaw;

                const sLow = s.toLowerCase();
                if (['returned', 'returning', 'đã hoàn', 'đang hoàn', 'hoàn'].some(x => sLow.includes(x))) statusStr = 'Returned';
                else if (['delivered', 'đã nhận', 'đã phát', 'thành công'].some(x => sLow.includes(x))) statusStr = 'Delivered';
                else if (['canceled', 'hủy', 'cancel'].includes(sLow)) statusStr = 'Canceled';
            });

            const mk = getMatchKey(phoneStr);
            if (mk) {
                if (!profileMap.has(mk)) {
                    profileMap.set(mk, { total: 0, returned: 0, rt: 0 });
                }
                const existing = profileMap.get(mk);

                // Usually we only count Delivered or Returned as valid historical 'total' orders that finished,
                // but some sellers count all. We will count all as total, but Canceled might be excluded.
                // Let's count ANY matched order as 1 total. (Like Pancake POS does).
                existing.total += 1;
                if (statusStr === 'Returned') existing.returned += 1;
                existing.rt = existing.total > 0 ? Math.round((existing.returned / existing.total) * 100) : 0;
            }
        });
    } else {
        // Existing grouped summary logic
        profiles.forEach(p => {
            const mk = getMatchKey(p['col_2']); // Phone C
            if (mk) {
                const total = parseInt((p['col_3'] || '0').toString().replace(/[^0-9]/g, '')) || 0; // Total D
                const returned = parseInt((p['col_4'] || '0').toString().replace(/[^0-9]/g, '')) || 0; // Returned E
                if (profileMap.has(mk)) {
                    const existing = profileMap.get(mk);
                    existing.total += total;
                    existing.returned += returned;
                    existing.rt = existing.total > 0 ? Math.round((existing.returned / existing.total) * 100) : 0;
                } else {
                    const rtPerc = total > 0 ? Math.round((returned / total) * 100) : 0;
                    profileMap.set(mk, { total: total, returned: returned, rt: rtPerc });
                }
            }
        });
    }

    const idx = autoSenseColumns(orders);

    orders.forEach(row => {
        const phoneRaw = (row['col_' + idx.phone] || '').toString();
        const matchKey = getMatchKey(phoneRaw);
        const address = (row['col_' + idx.address] || '').toString().trim();
        const cod = parseFloat((row['col_' + idx.cod] || '0').toString().replace(',', '.')) || 0;

        let city = (row['col_' + idx.city] || '').toString().trim();
        let aiSuggest = "";

        // AI CITY SUGGESTION (Only suggest, NO auto-fill)
        if (!city || city === phoneRaw || city.length < 2) {
            const suggested = suggestCityAI(address);
            if (suggested) aiSuggest = `🔍 AI Suggest: ${suggested}`;
        }

        const profile = profileMap.get(matchKey) || { total: 0, rt: 0 };
        const profileStr = `Ord: ${profile.total} | Rt: ${profile.rt}%`;

        const addrAi = evaluateAddress(address, city);

        // Base Rules
        let reasons = [];
        if (cod <= 0 || !Number.isInteger(cod)) reasons.push(`COD <= 0`);
        if (!matchKey) reasons.push("SĐT sai định dạng");
        if (!city || city === phoneRaw) reasons.push("Thiếu thành phố");
        if (profile.returned >= 2 || (profile.total >= 3 && profile.rt > 65)) reasons.push(`Hoàn cao (${profile.rt}%)`);

        // Ultimate SENSE-ALL Logic: Safe if Detailed OR Established History
        if (reasons.length === 0 && addrAi.isRisk) {
            if (profile.total > 0 && profile.rt <= 65) {
                // Safe History
            } else if (addrAi.isReliable) {
                // Safe Detailed (V7.4 Plot # Support)
            } else {
                reasons = [...reasons, ...addrAi.reasons];
            }
        }

        const data = {
            id: (row['col_' + idx.id] || row['col_1'] || 'N/A').toString(),
            phone: phoneRaw.trim(),
            city: (city === phoneRaw) ? "---" : city,
            address: address,
            cod: cod,
            profile: profileStr,
            reasons: reasons,
            aiNotes: (aiSuggest ? `<b>${aiSuggest}</b> | ` : "") + addrAi.notes.join(' | '),
            aiLabel: (reasons.length > 0) ? "Risk" : "Safe",
            isRisk: reasons.length > 0
        };

        if (reasons.length === 0) ready.push(data);
        else risk.push(data);
    });

    return { ready, risk };
}

function renderResults(results) {
    const rBody = document.getElementById('riskTableBody');
    const rdBody = document.getElementById('readyTableBody');
    rBody.innerHTML = ''; rdBody.innerHTML = '';

    results.risk.forEach(o => rBody.appendChild(renderRow(o, true)));
    results.ready.forEach(o => rdBody.appendChild(renderRow(o, false)));

    document.getElementById('totalSyncCount').textContent = results.risk.length + results.ready.length;
    document.getElementById('readySummaryCount').textContent = results.ready.length;
    document.getElementById('riskSummaryCount').textContent = results.risk.length;
    document.getElementById('riskCountTitle').textContent = results.risk.length;
    document.getElementById('readyCountTitle').textContent = results.ready.length;
}

function renderRow(o, isRisk) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><b>${o.id}</b></td>
        <td>${o.phone}</td>
        <td>${o.city}</td>
        <td><div style="max-width:400px; font-size:0.8rem">${o.address}</div></td>
        <td>${o.cod}</td>
        <td>${o.profile}</td>
        <td>
            <div style="color:${o.isRisk ? 'var(--risk-color)' : 'var(--success-color)'}; font-weight:bold; font-size:0.85rem">
                ${o.isRisk ? o.reasons.join('. ') : '✅ Ready to send'}
            </div>
            <div style="color:#aaa; font-size:0.75rem; margin-top:4px">AI Note: ${o.aiLabel} (${o.aiNotes})</div>
        </td>
    `;
    return tr;
}

function setLoading(isLoading) {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = isLoading ? 'inline-block' : 'none';
}

function setStatus(msg) {
    const statusMsg = document.getElementById('statusMsg');
    if (statusMsg) statusMsg.textContent = msg;
}

function fetchData(linkIndex) {
    const el = document.getElementById(`sheet${linkIndex}`);
    if (!el) return Promise.resolve([]);
    const url = el.value;
    const id = extractSheetId(url);
    const gid = extractGid(url);
    if (!id) return Promise.resolve([]);

    return new Promise((resolve) => {
        const callbackName = 'cb_' + Math.floor(Math.random() * 10000000);
        window[callbackName] = (data) => {
            if (!data || !data.table || !data.table.rows) resolve([]);
            else resolve(data.table.rows.map(row => {
                const obj = {};
                if (row.c) row.c.forEach((cell, i) => {
                    obj['col_' + i] = cell ? (cell.v || '').toString() : null;
                });
                return obj;
            }));
            delete window[callbackName];
        };
        const script = document.createElement('script');
        script.src = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json;responseHandler:${callbackName}${gid ? '&gid=' + gid : ''}`;
        document.body.appendChild(script);
        setTimeout(() => { if (window[callbackName]) { delete window[callbackName]; resolve([]); } }, 15000);
    });
}
function extractSheetId(url) {
    const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return (matches && matches[1]) ? matches[1] : null;
}
function extractGid(url) {
    const matches = url.match(/gid=([0-9]+)/);
    return (matches && matches[1]) ? matches[1] : null;
}
window.addEventListener('load', () => setTimeout(runCheck, 1000));
setInterval(runCheck, 60000);
