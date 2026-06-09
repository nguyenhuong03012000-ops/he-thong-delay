/* 
  KSA Order Risk PRO V7.4 (SENSE-ALL ADDRESS AI) 🛡️🇸🇦🚀 -> KUWAIT PORT
*/

(function () {

    async function runCheck() {
        setLoading(true);
        setStatus('V7.4 Syncing: Sense-All Address AI...');

        try {
            console.log('[V7.4] Syncing Links (Sense-All Heuristics)...');
            const [ordersData1, profilesData, tagsData, ordersData2] = await Promise.all([
                fetchData(1), // JNT KSA (gid=589)
                fetchData(2), // PosSheets (gid=124)
                fetchData(3), // POS Tags (gid=164)
                fetchData(4)  // JNT KSA-HLE
            ]);

            let ordersData = (ordersData1 || []).concat(ordersData2 || []);
            ordersData.headers = (ordersData1 && ordersData1.headers) ? ordersData1.headers :
                (ordersData2 && ordersData2.headers) ? ordersData2.headers : [];

            if (!ordersData || ordersData.length === 0) {
                setStatus('V7.4 Error: Data unavailable.');
                return;
            }

            setStatus(`V7.4 Analysis: ${ordersData.length} records...`);
            const results = processOrders(ordersData, profilesData, tagsData);

            renderResults(results);

            // Final visibility fix
            document.getElementById('hud_kw').classList.remove('hidden');
            document.getElementById('results_kw').classList.remove('hidden');
            document.getElementById('statusArea_kw').classList.add('hidden');

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
        if (clean.length === 13 && clean.startsWith('00965')) return clean.substring(5);
        if (clean.length === 12 && clean.startsWith('0965')) return clean.substring(4);
        if (clean.length === 11 && clean.startsWith('965')) return clean.substring(3);
        if (clean.length === 9 && clean.startsWith('0')) return clean.substring(1);
        if (clean.length === 8) return clean;
        return '';
    }

    const CITIES_KW = ["kuwait", "ahmadi", "hawalli", "farwaniya", "jahra", "mubarak al-kabeer", "salmiya", "mahboula", "fahaheel", "mangaf", "sabahiya", "salwa", "surra", "jabriya", "rumeithiya", "shuwaikh", "qurain", "asima"];

    function autoSenseColumns(rows) {
        // [KUWAIT FIX]: Disable auto-sensing because Account IDs like "CR26006238" contain exactly 8 digits and are mistaken for phone numbers.
        // ID is in Col 2 (REFERENCE layout in KW)
        return { id: 2, phone: 4, city: 10, address: 5, cod: 9 };
    }

    /** 
     * AI CITY RECOVERY (V7.4)
    */
    function suggestCityAI(address) {
        if (!address) return null;
        const addrLow = address.toLowerCase();
        for (let city of CITIES_KW) {
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

        const sep = "\\s*(no\\.?|number|num)?\\s*[-:.#='_/,]?\\s*";
        const hasBlock = new RegExp(`(block|blk|piece|blc|black|blck)${sep}\\d+`, 'i').test(addrLow);
        const hasStreet = new RegExp(`(street|st|st\\.|road|rd|sharia|jadda)${sep}\\d+`, 'i').test(addrLow);
        const hasHouse = new RegExp(`(house|building|bldg|flat|floor|apt|villa|bld|hno|hse|hs)${sep}\\d+`, 'i').test(addrLow);
        const hasPaci = /\b\d{8}\b/.test(addrLow);
        const hasPlusCode = /\b[0-9A-Z]{4}\+[0-9A-Z]{2,3}\b/.test(address.toUpperCase());
        const hasLandmark = /(restaurant|hospital|clinic|mall|school|university|hotel|center|pharmacy|supermarket|bakery|salon|shop|spa|market|mart|hyper|grocery|office|tower|court|bank|mosque)/i.test(addrLow);

        const isReliable = hasPaci || hasPlusCode || (hasBlock && (hasHouse || hasStreet || hasLandmark)) || (hasStreet && hasHouse) || (hasHouse && hasLandmark);

        const notes = [];
        if (hasPlusCode) notes.push("📍 Plus Code Match");
        if (hasPaci) notes.push("🔢 PACI Number Match");
        if (hasBlock) notes.push("🏘️ Block detected");
        if (hasStreet) notes.push("🛣️ Street detected");
        if (hasHouse) notes.push("🏠 House/Bldg info");
        if (hasLandmark) notes.push("🏪 Landmark info");

        const errors = [];
        // Optional City requirement for Kuwait
        if (!city || city.length < 2) {
            if (!isReliable) errors.push("Thiếu thành phố");
        }
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
    function processOrders(orders, profiles, tagsData) {
        const ready = [];
        const risk = [];

        // Map POS Tags (Link 3)
        const tagsMap = new Map();
        let noteColSheet3 = -1;
        if (tagsData && tagsData.headers) {
            noteColSheet3 = tagsData.headers.findIndex(h => h && h.toLowerCase().includes('ghi chú'));
        }

        if (tagsData) {
            tagsData.forEach(row => {
                const mk = getMatchKey(row['col_2']); // Phone C
                if (mk) {
                    const tagStr = (row['col_9'] || '').toString(); // Thẻ J
                    let noteStr = noteColSheet3 >= 0 ? (row['col_' + noteColSheet3] || '').toString().trim() : '';

                    if (tagStr.trim() || noteStr) {
                        if (!tagsMap.has(mk)) tagsMap.set(mk, { reasons: new Set(), notes: new Set() });

                        let reasons = tagStr.split(/[,●\n|]+/)
                            .map(t => t.trim())
                            .filter(t => t && t.toLowerCase() !== 'giao không thành');

                        reasons.forEach(r => tagsMap.get(mk).reasons.add(r));
                        if (noteStr && noteStr !== '-') tagsMap.get(mk).notes.add(noteStr);
                    }
                }
            });
        }

        // Map Profiles (Link 2 & Link 3) - Auto-detect grouped vs raw list regardless of where user pasted it
        const profileMap = new Map();

        // Merge source data to find raw lists
        let allProfileRows = profiles.concat(tagsData || []);
        let isRawList = false;

        // Check first 20 rows of profiles
        for (let i = 0; i < Math.min(20, profiles.length); i++) {
            const rowStr = Object.values(profiles[i] || {}).join(' ').toLowerCase();
            if (rowStr.match(/(returned|delivered|đã nhận|đã phát|đã hoàn|đang hoàn|hoàn|returning|canceled|hủy|đã xác nhận|đang đóng hàng|đã gửi hàng|shipped)/)) {
                isRawList = true;
                break;
            }
        }

        // Check first 20 rows of tagsData if not found yet
        if (!isRawList && tagsData) {
            for (let i = 0; i < Math.min(20, tagsData.length); i++) {
                const rowStr = Object.values(tagsData[i] || {}).join(' ').toLowerCase();
                if (rowStr.match(/(returned|delivered|đã nhận|đã phát|đã hoàn|đang hoàn|hoàn|returning|canceled|hủy|đã xác nhận|đang đóng hàng|đã gửi hàng|shipped)/)) {
                    isRawList = true;
                    break;
                }
            }
        }

        if (isRawList) {
            let countedOrders = new Set();

            allProfileRows.forEach(p => {
                let phoneStr = "";
                let statusStr = "";
                let orderIdStr = "";

                Object.values(p).forEach(val => {
                    const s = (val || '').toString().trim();

                    if (!s.toLowerCase().includes('date(')) {
                        const mkRaw = getMatchKey(s);
                        if (mkRaw && !phoneStr) phoneStr = mkRaw;
                        const idMatch = s.match(/^(?:#|id|f|fb|facebook|icon|-|_|\s)*(\d{3,12})$/i);
                        if (idMatch && !orderIdStr) orderIdStr = idMatch[1];
                    }

                    const sLow = s.toLowerCase();
                    // Strong specific matches
                    if (sLow.includes('đã hoàn') || sLow.includes('đang hoàn') || ['returned'].includes(sLow)) statusStr = 'Returned';
                    else if (sLow.includes('đã nhận') || sLow.includes('đã phát') || ['delivered', 'thành công'].includes(sLow)) statusStr = 'Delivered';
                    else if (sLow.includes('đã gửi hàng') || sLow.includes('đang giao') || ['shipped', 'undeliverable'].includes(sLow)) statusStr = 'Shipped';
                    else if (sLow.includes('đã huỷ') || sLow.includes('đã hủy') || ['canceled', 'cancel'].includes(sLow)) statusStr = 'Canceled';
                    else if (sLow.includes('đã xác nhận') || sLow.includes('đang đóng hàng')) {
                        if (!statusStr) statusStr = 'Pending';
                    }
                    // Weak exact matches
                    else if (statusStr === '') {
                        if (sLow === 'hoàn' || sLow === 'returning') statusStr = 'Returned';
                        else if (sLow === 'hủy' || sLow === 'huỷ') statusStr = 'Canceled';
                        else if (sLow === 'chờ' || sLow === 'mới') statusStr = 'Pending';
                    }
                });

                const mk = getMatchKey(phoneStr);
                if (mk && statusStr && ['Returned', 'Delivered', 'Shipped'].includes(statusStr)) {
                    const uniqueKey = mk + "_" + (orderIdStr || Math.random().toString());
                    if (!countedOrders.has(uniqueKey)) {
                        countedOrders.add(uniqueKey);

                        if (!profileMap.has(mk)) {
                            profileMap.set(mk, { total: 0, returned: 0, rt: 0 });
                        }
                        const existing = profileMap.get(mk);

                        existing.total += 1;
                        if (statusStr === 'Returned') existing.returned += 1;
                        existing.rt = existing.total > 0 ? Math.round((existing.returned / existing.total) * 100) : 0;
                    }
                }
            });
        } else {
            // Fallback for grouped POS 'Khách hàng' export
            profiles.forEach(p => {
                const mk = getMatchKey(p['col_2']); // Phone C
                if (mk) {
                    const total = parseInt((p['col_3'] || '0').toString().replace(/[^0-9]/g, '')) || 0; // Total D
                    const returned = parseInt((p['col_4'] || '0').toString().replace(/[^0-9]/g, '')) || 0; // Returned E
                    if (profileMap.has(mk)) {
                        const existing = profileMap.get(mk);
                        existing.total = Math.max(existing.total, total);
                        existing.returned = Math.max(existing.returned, returned);
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

            // New Order Internal Note (Sheet 1/4)
            let noteColSheet1 = orders.headers ? orders.headers.findIndex(h => h && h.toLowerCase().includes('ghi chú')) : -1;
            let newOrderNote = noteColSheet1 >= 0 ? (row['col_' + noteColSheet1] || '').toString().trim() : '';

            const profile = profileMap.get(matchKey) || { total: 0, rt: 0 };
            const profileStr = `Ord: ${profile.total} | Rt: ${profile.rt}%`;

            const addrAi = evaluateAddress(address, city);

            // Base Rules
            let reasons = [];
            if (cod <= 0) reasons.push(`COD <= 0`);
            if (!matchKey) reasons.push("SĐT sai định dạng");
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

            let returnReasonStr = "-";
            let oldOrderNotes = [];

            if (profile.returned > 0 || profile.rt > 0) {
                if (tagsMap.has(matchKey)) {
                    const tagData = tagsMap.get(matchKey);
                    if (tagData.reasons.size > 0) returnReasonStr = Array.from(tagData.reasons).join(", ");
                    if (tagData.notes.size > 0) oldOrderNotes = Array.from(tagData.notes);
                }
            }

            let combinedNotes = aiSuggest ? `<b>${aiSuggest}</b><br>` : "";
            if (newOrderNote && newOrderNote !== '-') {
                combinedNotes += `<span style="color:#3b82f6; font-weight:bold; font-size:11px;">[Note Mới]: ${newOrderNote}</span><br>`;
            }
            if (oldOrderNotes.length > 0) {
                combinedNotes += `<span style="color:#ef4444; font-weight:bold; font-size:11px;">[Note Lịch Sử]: ${oldOrderNotes.join(' | ')}</span><br>`;
            }
            combinedNotes += addrAi.notes.join(' | ');

            const data = {
                id: (row['col_' + idx.id] || row['col_1'] || 'N/A').toString(),
                phone: phoneRaw.trim(),
                city: (city === phoneRaw) ? "---" : city,
                address: address,
                cod: cod,
                profile: profileStr,
                returnReason: returnReasonStr,
                reasons: reasons,
                aiNotes: combinedNotes,
                aiLabel: (reasons.length > 0) ? "Risk" : "Safe",
                isRisk: reasons.length > 0
            };

            if (reasons.length === 0) ready.push(data);
            else risk.push(data);
        });

        return { ready, risk };
    }

    function renderResults(results) {
        const rBody = document.getElementById('riskTableBody_kw');
        const rdBody = document.getElementById('readyTableBody_kw');
        rBody.innerHTML = ''; rdBody.innerHTML = '';

        results.risk.forEach(o => rBody.appendChild(renderRow(o, true)));
        results.ready.forEach(o => rdBody.appendChild(renderRow(o, false)));

        document.getElementById('totalSyncCount_kw').textContent = results.risk.length + results.ready.length;
        document.getElementById('readySummaryCount_kw').textContent = results.ready.length;
        document.getElementById('riskSummaryCount_kw').textContent = results.risk.length;
        document.getElementById('riskCountTitle_kw').textContent = results.risk.length;
        document.getElementById('readyCountTitle_kw').textContent = results.ready.length;
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
        <td style="color:#fb923c; font-weight:600; font-size:0.85rem">${o.returnReason}</td>
        <td>
            <div style="color:${o.isRisk ? 'var(--risk-color)' : 'var(--success-color)'}; font-weight:bold; font-size:0.85rem">
                ${o.isRisk ? o.reasons.join('. ') : '✅ Ready to send'}
            </div>
            <div style="color:#64748b; font-size:0.8rem; margin-top:4px">AI Note: ${o.aiLabel} (${o.aiNotes})</div>
        </td>
    `;
        return tr;
    }

    function setLoading(isLoading) {
        const loader = document.getElementById('loader_kw');
        if (loader) loader.style.display = isLoading ? 'inline-block' : 'none';
    }

    function setStatus(msg) {
        const statusMsg = document.getElementById('statusMsg_kw');
        if (statusMsg) statusMsg.textContent = msg;
    }

    function fetchData(linkIndex) {
        const el = document.getElementById(`sheet${linkIndex}_kw`);
        if (!el) return Promise.resolve([]);
        const url = el.value;
        const id = extractSheetId(url);
        const gid = extractGid(url);
        if (!id) return Promise.resolve([]);

        return new Promise((resolve) => {
            const callbackName = 'cb_' + Math.floor(Math.random() * 10000000);
            window[callbackName] = (data) => {
                if (!data || !data.table || !data.table.rows) resolve([]);
                else {
                    const headers = data.table.cols ? data.table.cols.map(c => c.label || '') : [];
                    const arr = data.table.rows.map(row => {
                        const obj = {};
                        if (row.c) row.c.forEach((cell, i) => {
                            obj['col_' + i] = cell ? (cell.v || '').toString() : null;
                        });
                        return obj;
                    });
                    arr.headers = headers;
                    resolve(arr);
                }
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

})();
