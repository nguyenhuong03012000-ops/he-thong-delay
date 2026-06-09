/**
 * Delay Orders Monitoring Module
 * Reads from POS API, validates required fields, computes delays, and renders dashboard.
 */

window.delayModule = (function () {
    const API_KEY = "f6a4b7d3110c4dcdac0a5c04e3d81ea4";
    const SHOP_ID = "714234971";

    // Required fields per spec
    const REQUIRED_FIELDS = [
        "order_id", "tracking_number", "carrier", "market", "city",
        "customer_name", "phone", "created_at", "shipped_at",
        "latest_status", "latest_status_time", "order_tags", "shop_id"
    ];

    // Force API timestamps missing standard timezone boundaries into pure UTC context
    function parsePancakeDate(dateString) {
        if (!dateString) return null;
        if (dateString.includes('T') && !dateString.endsWith('Z') && !dateString.includes('+')) {
            return dateString + 'Z';
        }
        return dateString;
    }

    // Google Sheets Helpers
    function extractSheetId(url) {
        const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return match ? match[1] : null;
    }

    function extractGid(url) {
        const match = url.match(/[#&]gid=([0-9]+)/);
        return match ? match[1] : '0';
    }

    function fetchSingleSheetTags(elId) {
        const el = document.getElementById(elId);
        if (!el) return Promise.resolve(new Map());
        const url = el.value;
        const id = extractSheetId(url);
        const gid = extractGid(url);
        if (!id) return Promise.resolve(new Map());

        return new Promise((resolve) => {
            const callbackName = 'cb_tags_' + Math.floor(Math.random() * 10000000);
            window[callbackName] = (data) => {
                const sheetTagsMap = new Map();
                if (!data || !data.table || !data.table.rows) {
                    resolve(sheetTagsMap);
                    return;
                }
                data.table.rows.forEach(r => {
                    if (r.c) {
                        const orderId = r.c[0] && r.c[0].v ? r.c[0].v.toString().trim() : null;
                        const tagsRaw = r.c[9] && r.c[9].v ? r.c[9].v.toString() : ''; // col_9 = J = Tags
                        if (orderId && tagsRaw && tagsRaw !== '-' && tagsRaw !== 'undefined') {
                            const tags = tagsRaw.split(/[,●\n|]+/).map(t => t.trim()).filter(Boolean);
                            if (tags.length > 0) sheetTagsMap.set(orderId, tags);
                        }
                    }
                });
                resolve(sheetTagsMap);
            };

            const script = document.createElement('script');
            script.src = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json;tq:;responseHandler:${callbackName}&gid=${gid}`;
            script.onerror = () => resolve(new Map());
            document.body.appendChild(script);
        });
    }

    async function fetchTagsFromSheet() {
        const maps = await Promise.all([
            fetchSingleSheetTags('sheet1'),
            fetchSingleSheetTags('sheet2'),
            fetchSingleSheetTags('sheet3'),
            fetchSingleSheetTags('sheet4')
        ]);

        const merged = new Map();
        maps.forEach(m => {
            for (let [k, v] of m.entries()) {
                if (!merged.has(k)) merged.set(k, []);
                merged.set(k, [...merged.get(k), ...v]);
            }
        });
        return merged;
    }

    // Isolate exact 'Đang đóng hàng' physical packing timestamp from historically stacked operations array 
    function extractPackingTime(raw) {
        if (raw.histories && Array.isArray(raw.histories)) {
            const packEvent = raw.histories.find(h => h.status && h.status.new === 8); // 8 = Đang đóng hàng
            if (packEvent && packEvent.updated_at) return packEvent.updated_at;
        }
        // Fallbacks
        return raw.time_send_partner || raw.shipped_at || raw.inserted_at;
    }

    function validateOrder(order) {
        const missing = [];
        REQUIRED_FIELDS.forEach(field => {
            if (order[field] === undefined) missing.push(field);
        });
        return missing;
    }

    function mapPancakeOrder(raw) {
        let city = (raw.shipping_address && (raw.shipping_address.province || raw.shipping_address.province_name)) || raw.city || "Unknown";
        let market = raw.market || "Unknown";

        const ksaCities = ['riyadh', 'jeddah', 'makkah', 'medina', 'dammam', 'taif', 'tabuk', 'abha', 'khobar'];
        const uaeCities = ['dubai', 'abu dhabi', 'sharjah', 'ajman', 'al ain', 'fujairah', 'rak', 'ras al khaimah'];

        if (market === "Unknown") {
            const lowerCity = city.toLowerCase();
            if (ksaCities.some(c => lowerCity.includes(c))) market = "KSA";
            else if (uaeCities.some(c => lowerCity.includes(c))) market = "UAE";
        }

        let rawCarrier = raw.carrier || raw.partner || raw.carrier_name || raw.partner_name || "Unknown";
        let carrierStr = typeof rawCarrier === 'object' ? (rawCarrier.partner_name || rawCarrier.name || "Unknown") : String(rawCarrier);

        // Fallback: Infer carrier from tags or shipping address
        if (carrierStr === "Unknown" || carrierStr === "N/A" || !carrierStr || carrierStr === 'undefined') {
            const rawTagsStr = JSON.stringify(raw.tags || raw.order_tags || []).toUpperCase();
            if (rawTagsStr.includes('JNT UAE') || (rawTagsStr.includes('JNT') && market === 'UAE')) carrierStr = 'JNT UAE';
            else if (rawTagsStr.includes('JNT') || rawTagsStr.includes('J&T')) carrierStr = 'JNT KSA';
            else if (rawTagsStr.includes('IMILE')) carrierStr = 'IMILE';
            else if (rawTagsStr.includes('WESHIP')) carrierStr = 'WESHIP KSA';
        }

        // Market inference based on Carrier
        const carLow = carrierStr.toLowerCase();
        if (market === "Unknown" || !market) {
            if (carLow.includes("uae") || carLow === "jnt uae") market = "UAE";
            else if (carLow.includes("ksa") || carLow.includes("weship") || carLow === "imile" || carLow === "jnt ksa") market = "KSA";
        }

        return {
            order_id: raw.id || raw.order_id || "N/A",
            tracking_number: (raw.partner && raw.partner.extend_code) || raw.tracking_number || raw.tracking_link || "N/A",
            carrier: carrierStr,
            market: market,
            city: city,
            customer_name: (raw.customer && raw.customer.name) || raw.bill_full_name || raw.customer_name || "Unknown",
            phone: raw.bill_phone_number || (raw.customer && raw.customer.phone_number) || raw.phone || "Unknown",
            created_at: parsePancakeDate(raw.inserted_at || raw.created_at || null),
            shipped_at: parsePancakeDate(extractPackingTime(raw)),
            latest_status: raw.status_name || raw.status || "Unknown",
            latest_status_time: parsePancakeDate(raw.updated_at || raw.latest_status_time || null),
            final_status: checkFinalStatus(raw.status_name || raw.status),
            final_status_time: parsePancakeDate(checkFinalStatus(raw.status_name || raw.status) ? (raw.updated_at || raw.latest_status_time) : null),
            order_tags: raw.tags || raw.order_tags || [],
            shop_id: raw.shop_id || SHOP_ID,
            page_id: raw.page_id || (raw.page && raw.page.id) || "1029988856864809",
            customer_id: (raw.customer && raw.customer.id) || null,
            conversation_link: (raw.customer && raw.customer.conversation_link) || null,
            pos_link: raw.order_link || `https://pos.pancake.vn/shop/${SHOP_ID}/order?order_id=${raw.order_id || raw.id}`,
            pos_note: [raw.note, raw.seller_note, raw.shipping_note, raw.customer_note, raw.partner_note].filter(Boolean).join(' | ')
        };
    }

    function checkFinalStatus(status) {
        if (!status) return null;
        const s = status.toString().toLowerCase();
        if (s.includes('delivered') || s.includes('received') || s.includes('đã giao') || s === '8') return 'Delivered';
        if (s.includes('returned') || s.includes('đã hoàn') || s === '7' || s === '9') return 'Returned';
        return null;
    }

    // IndexedDB Helper for Large Data Storage
    const DB_NAME = 'DelayOrdersDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'ordersStore';

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveToIndexedDB(data) {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(data, 'cached_orders');
            store.put(Date.now(), 'cached_time');
            return new Promise(resolve => {
                tx.oncomplete = () => { db.close(); resolve(true); };
            });
        } catch (e) { console.warn('IndexedDB Backup Failed:', e); }
    }

    async function loadFromIndexedDB() {
        try {
            const db = await openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const dataReq = store.get('cached_orders');
            const timeReq = store.get('cached_time');
            return new Promise(resolve => {
                tx.oncomplete = () => {
                    db.close();
                    resolve({ data: dataReq.result, time: timeReq.result });
                };
            });
        } catch (e) {
            console.warn('IndexedDB Load Failed:', e);
            return { data: null, time: null };
        }
    }

    let _allFetchedOrders = [];
    let _isFetching = false;

    async function runDelayCheck() {
        if (_isFetching) return;

        const statusEl = document.getElementById('delayStatus');
        const debugEl = document.getElementById('delayDebug');

        _isFetching = true;
        statusEl.innerHTML = "Khởi tạo kết nối dữ liệu (Vui lòng đợi mạng)...";
        if (_allFetchedOrders.length > 0) {
            statusEl.innerHTML = `Đang đồng bộ dữ liệu mới ngầm (Vẫn giữ dữ liệu báo cáo cũ cho bạn xem)...`;
        } else {
            debugEl.innerHTML = "";
        }

        const logDebug = (msg) => {
            if (_allFetchedOrders.length === 0) debugEl.innerHTML += `<div><span style="color:#facc15">[DEBUG]</span> ${msg}</div>`;
            console.log(`[DEBUG] ${msg}`);
        };

        // Retry wrapper to ensure 100% data reach even if connection hiccups
        async function fetchWithRetry(url, retries = 3) {
            for (let i = 0; i < retries; i++) {
                try {
                    const controller = new AbortController();
                    const id = setTimeout(() => controller.abort(), 20000); // 20s timeout per retry
                    const res = await fetch(url, { signal: controller.signal });
                    clearTimeout(id);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return await res.json();
                } catch (err) {
                    if (i === retries - 1) return null; // Fail gracefully after 3 retries
                    await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Incremental backoff
                }
            }
        }

        try {
            statusEl.innerHTML = "Đang tải báo cáo Data (Super Fast MongoDB)...";
            // Auto-detect if running as local file vs hosted
            const apiEndpoint = (window.location.protocol === 'file:' || window.location.hostname === 'localhost')
                ? 'http://localhost:3000/api/delay-orders'
                : '/api/delay-orders';

            const req = await fetchWithRetry(apiEndpoint, 3);
            if (!req || !req.success) {
                statusEl.innerHTML = `Lỗi kết nối Server Cache: ${req ? req.error : 'Unknown'}. Vui lòng thử lại.`;
                _isFetching = false;
                return;
            }

            let allRawOrders = req.data || [];
            const totalApiEntries = req.count || allRawOrders.length;

            logDebug(`Backend DB Cache loaded: ${allRawOrders.length} orders.`);

            if (allRawOrders.length === 0) {
                statusEl.innerHTML = "No orders found.";
                _isFetching = false;
                return;
            }

            // Map the raw POS API schema to the required User Schema
            _allFetchedOrders = allRawOrders.map(raw => {
                const o = mapPancakeOrder(raw);
                return o;
            });

            // Save to IndexedDB safely
            await saveToIndexedDB(_allFetchedOrders);

            // Print sample mapped fields (first order)
            if (_allFetchedOrders.length > 0) {
                const s = _allFetchedOrders[0];
                logDebug(`Sample mapped order [${s.order_id}]: Market=${s.market}, Carrier=${s.carrier}, City=${s.city}, Status=${s.latest_status}`);
            }

            statusEl.innerHTML = `Data fetched successfully. Applying filters...`;
            logDebug(`Data cached in memory. Ready for real-time filtering.`);

            populateFilterDropdowns();
            applyFilters(totalApiEntries);

        } catch (e) {
            console.error(e);
            document.getElementById('delayStatus').innerHTML = `<span style='color:red'>Fetch Error: ${e.message}</span>`;
        } finally {
            _isFetching = false;
        }
    }

    function populateFilterDropdowns() {
        if (!_allFetchedOrders || _allFetchedOrders.length === 0) return;

        const markets = [...new Set(_allFetchedOrders.map(o => o.market))].filter(Boolean).sort();
        const carriers = [...new Set(_allFetchedOrders.map(o => o.carrier))].filter(Boolean).sort();
        const cities = [...new Set(_allFetchedOrders.map(o => o.city))].filter(Boolean).sort();
        const statuses = [...new Set(_allFetchedOrders.map(o => o.latest_status))].filter(Boolean).sort();

        const tagsSet = new Set();
        _allFetchedOrders.forEach(o => {
            let tList = [];
            if (Array.isArray(o.order_tags)) tList = o.order_tags.map(t => typeof t === 'object' ? (t.name || t.text || t.label || String(t)) : String(t));
            else if (typeof o.order_tags === 'string') tList = o.order_tags.split(/[,●\n|]+/).map(t => t.trim());
            tList.forEach(t => { if (t) tagsSet.add(t); });
        });
        const tags = [...tagsSet].sort();

        const buildOptions = (arr, defaultText) => `<option value="" style="color:black">${defaultText}</option>` + arr.map(item => `<option value="${item}" style="color:black">${item}</option>`).join('');

        const mEl = document.getElementById('filterMarket');
        const cEl = document.getElementById('filterCarrier');
        const ciEl = document.getElementById('filterCity');
        const sEl = document.getElementById('filterStatus');
        const tEl = document.getElementById('filterTag');

        const curM = mEl ? mEl.value : "";
        const curC = cEl ? cEl.value : "";
        const curCi = ciEl ? ciEl.value : "";
        const curS = sEl ? sEl.value : "";
        const curT = tEl ? tEl.value : "";

        if (mEl) { mEl.innerHTML = buildOptions(markets, 'All Markets'); mEl.value = curM; }
        if (cEl) { cEl.innerHTML = buildOptions(carriers, 'All Carriers'); cEl.value = curC; }
        if (ciEl) { ciEl.innerHTML = buildOptions(cities, 'All Cities'); ciEl.value = curCi; }
        if (sEl) { sEl.innerHTML = buildOptions(statuses, 'All Statuses'); sEl.value = curS; }
        if (tEl) { tEl.innerHTML = buildOptions(tags, 'All Tags'); tEl.value = curT; }

        document.querySelectorAll('.lf-tag').forEach(el => { const v = el.value; el.innerHTML = buildOptions(tags, 'All Tags'); el.value = v; });
        document.querySelectorAll('.lf-status').forEach(el => { const v = el.value; el.innerHTML = buildOptions(statuses, 'All Statuses'); el.value = v; });
    }

    function applyFilters(totalApiEntries) {
        totalApiEntries = totalApiEntries || 0;
        if (!_allFetchedOrders || _allFetchedOrders.length === 0) return;

        const fMarket = document.getElementById('filterMarket').value.toLowerCase().trim();
        const fCarrier = document.getElementById('filterCarrier').value.toLowerCase().trim();
        const fCity = document.getElementById('filterCity').value.toLowerCase().trim();
        const fStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value.toLowerCase().trim() : '';
        const fTagSelect = document.getElementById('filterTag') ? document.getElementById('filterTag').value.toLowerCase().trim() : '';
        const fFrom = document.getElementById('filterDateFrom').value;
        const fTo = document.getElementById('filterDateTo').value;
        const fCustomer = document.querySelector('.tbl-filter-customer') ? document.querySelector('.tbl-filter-customer').value.toLowerCase().trim() : '';
        const fTagText = document.querySelector('.tbl-filter-tag') ? document.querySelector('.tbl-filter-tag').value.toLowerCase().trim() : '';

        let orders = _allFetchedOrders.filter(o => {
            if (fMarket && !String(o.market).toLowerCase().includes(fMarket)) return false;
            if (fCarrier && !String(o.carrier).toLowerCase().includes(fCarrier)) return false;
            if (fCity && !String(o.city).toLowerCase().includes(fCity)) return false;
            if (fStatus && !String(o.latest_status).toLowerCase().includes(fStatus)) return false;
            if (fCustomer && !String(o.customer_name).toLowerCase().includes(fCustomer)) return false;

            // Allow combining Top Dropdown Tag and Table Header Text Tag loosely
            if (fTagSelect || fTagText) {
                let tagsStr = Array.isArray(o.order_tags) ? o.order_tags.join(' ').toLowerCase() : String(o.order_tags).toLowerCase();
                if (fTagSelect && !tagsStr.includes(fTagSelect)) return false;
                if (fTagText && !tagsStr.includes(fTagText)) return false;
            }

            if (fFrom || fTo) {
                const compDate = o.shipped_at ? new Date(o.shipped_at) : (o.created_at ? new Date(o.created_at) : new Date());
                if (fFrom && compDate < new Date(fFrom)) return false;
                if (fTo) {
                    const tDate = new Date(fTo);
                    tDate.setDate(tDate.getDate() + 1); // include the whole day
                    if (compDate >= tDate) return false;
                }
            }
            return true;
        });

        const statusEl = document.getElementById('delayStatus');

        // Diagnostic Log
        const refusedRaw = _allFetchedOrders.filter(o => {
            let tagsStr = Array.isArray(o.order_tags) ? o.order_tags.map(t => typeof t === 'object' ? (t.name || t.text || t.label || String(t)) : String(t)).join(' ').toLowerCase() : String(o.order_tags).toLowerCase();
            return tagsStr.includes('refused');
        });
        const refusedFiltered = orders.filter(o => {
            let tagsStr = Array.isArray(o.order_tags) ? o.order_tags.map(t => typeof t === 'object' ? (t.name || t.text || t.label || String(t)) : String(t)).join(' ').toLowerCase() : String(o.order_tags).toLowerCase();
            return tagsStr.includes('refused');
        });
        const diagnosticInfo = ` [Diagnostic: Found \${refusedRaw.length} "Refused" globally in API fetch, \${refusedFiltered.length} after filterDateFrom]`;

        statusEl.innerHTML = `Analyzing ${orders.length} filtered orders... \${diagnosticInfo}`;
        const results = processLogic(orders);

        // Compute Global Analytics using the FILTERED orders so charts match the total orders shown
        const globalStats = extractGlobalStats(orders);
        results.tagStats = globalStats.tagStats;
        results.cityStats = globalStats.cityStats;

        window._currentDelayResults = results; // Save BEFORE rendering!
        renderDashboard(results);

        const fetchComplete = !totalApiEntries || _allFetchedOrders.length >= totalApiEntries;
        const fetchBadge = fetchComplete
            ? `<span style='background:#10b981; color:#fff; border-radius:4px; padding:2px 8px; font-size:11px; margin-left:8px;'>✔ Đã fetch đủ ${_allFetchedOrders.length.toLocaleString()} / ${totalApiEntries.toLocaleString()} đơn</span>`
            : `<span style='background:#f97316; color:#fff; border-radius:4px; padding:2px 8px; font-size:11px; margin-left:8px;'>⚠ Chỉ fetch được ${_allFetchedOrders.length.toLocaleString()} / ${totalApiEntries.toLocaleString()} đơn (một số trang bị timeout)</span>`;

        statusEl.innerHTML = `<span style='color:#4ade80'>Đang hiển thị <b>${orders.length.toLocaleString()}</b> đơn phù hợp bộ lọc. ${fetchBadge} &nbsp;|&nbsp; Cập nhật lúc: ${new Date().toLocaleTimeString()}</span>`;
    }

    function extractGlobalStats(allOrders) {
        const tStats = {};
        const cStats = {};

        allOrders.forEach(o => {
            const dropStatuses = ["đợi xác nhận", "đã xác nhận", "hủy", "cancel", "hủy đơn", "đã hủy", "mới", "new", "submitted", "packing", "đóng hàng", "wait submit", "wait_submit", "chờ chuyển", "chờ lấy"];
            if (o.latest_status && dropStatuses.some(ds => o.latest_status.toLowerCase().includes(ds))) return;

            const isDelivered = o.final_status === 'Delivered';
            const isLatestFailed = typeof o.latest_status === 'string' && ['returned', 'returning', 'đã hoàn', 'đang hoàn'].some(s => o.latest_status.toLowerCase().includes(s));
            const isReturned = o.final_status === 'Returned' || isLatestFailed;
            const hasShipped = !!o.shipped_at || isDelivered || isReturned;

            if (hasShipped) {
                // Parse Tags
                let tags = [];
                if (Array.isArray(o.order_tags)) {
                    tags = o.order_tags.map(t => typeof t === 'object' ? (t.name || t.text || t.label || '') : String(t));
                } else if (typeof o.order_tags === 'string') {
                    tags = o.order_tags.split(/[,●\n|]+/).map(t => t.trim());
                }

                const ignoreTags = ["waiting for confirmation", "yêu cầu hủy", "out of stock", "reconciled", "hoàn dvvc", "chú ý", "lần 1", "lần 2", "lần 3", "phát sinh", "mới", "đã hoàn", "giao thành công", "đã giao", "giao tc", "none", "unknown", "jnt ksa", "jnt uae", "imile", "returning", "shipment was not delivered", "[object object]", "undeliverable", "0", "on delivery"];
                tags.forEach(t => {
                    if (!t) return;
                    const low = t.toLowerCase();
                    if (low === "0" || low === "[object object]") return;
                    if (low.length < 2 || ignoreTags.some(ig => low === ig || low.includes(ig)) || low.includes("đơn ngày") || low.includes("delay")) return;

                    if (!tStats[t]) tStats[t] = { delivered: 0, returned: 0, total: 0 };
                    tStats[t].total++;
                    if (isDelivered) tStats[t].delivered++;
                    else if (isReturned) tStats[t].returned++;
                });

                // Parse Cities
                const cityNorm = (o.city || '(Trống)').toString().trim() || '(Trống)';
                if (!cStats[cityNorm]) cStats[cityNorm] = { delivered: 0, returned: 0, total: 0 };
                cStats[cityNorm].total++;
                if (isDelivered) cStats[cityNorm].delivered++;
                else if (isReturned) cStats[cityNorm].returned++;
            }
        });

        return { tagStats: tStats, cityStats: cStats };
    }

    function processLogic(orders) {
        const today = new Date();
        const needFollow = [];
        const overdue = [];
        const appointment = [];
        let totalInProgress = 0;
        let failTagsCount = 0;
        let totalDeliveryDays = 0;
        let deliveredCount = 0;

        const cityDelays = {};
        const carrierDelays = {};
        const cityDeliveryTimes = {};
        const carrierDeliveryTimes = {};
        const ageDist = { "0-3": 0, "4-5": 0, "6-7": 0, ">7": 0 };
        const tagStats = {};
        const cityStats = {};

        orders.forEach(o => {
            // Explicitly drop cancelled or unconfirmed orders completely early
            const dropStatuses = ["đợi xác nhận", "đã xác nhận", "hủy", "cancel", "hủy đơn", "đã hủy", "mới", "new", "submitted", "packing", "đóng hàng", "wait submit", "wait_submit", "chờ chuyển", "chờ lấy"];
            if (o.latest_status && dropStatuses.some(ds => o.latest_status.toLowerCase().includes(ds))) return;

            const isDelivered = o.final_status === 'Delivered';
            const isLatestFailed = typeof o.latest_status === 'string' && ['returned', 'returning', 'đã hoàn', 'đang hoàn'].some(s => o.latest_status.toLowerCase().includes(s));
            const isReturned = o.final_status === 'Returned' || isLatestFailed;

            // (Global Analytics extraction moved entirely to extractGlobalStats function)

            // Do NOT track ANY orders for Delay Tools down below unless they have officially shipped out of the warehouse
            if (!o.shipped_at) return;

            const shipDate = new Date(o.shipped_at);
            const isFinal = (o.final_status === 'Delivered' || o.final_status === 'Returned' || o.final_status_time);

            // Average delivery time formula
            if (isFinal && o.final_status === 'Delivered' && o.final_status_time) {
                const finalDate = new Date(o.final_status_time);
                const days = (finalDate - shipDate) / (1000 * 60 * 60 * 24);
                if (days >= 0) {
                    totalDeliveryDays += days;
                    deliveredCount++;

                    if (!cityDeliveryTimes[o.city]) cityDeliveryTimes[o.city] = { total: 0, count: 0 };
                    cityDeliveryTimes[o.city].total += days;
                    cityDeliveryTimes[o.city].count++;

                    if (!carrierDeliveryTimes[o.carrier]) carrierDeliveryTimes[o.carrier] = { total: 0, count: 0 };
                    carrierDeliveryTimes[o.carrier].total += days;
                    carrierDeliveryTimes[o.carrier].count++;
                }
            }

            // Track ONLY orders that do not yet have final status
            if (isFinal) return;

            totalInProgress++;

            const lastUpdateDate = new Date(o.latest_status_time || o.shipped_at);
            const daysSinceShip = Math.floor((today - shipDate) / (1000 * 60 * 60 * 24));
            const daysSinceUpdate = Math.floor((today - lastUpdateDate) / (1000 * 60 * 60 * 24));

            // Determine Age Bucket
            if (daysSinceShip <= 3) ageDist["0-3"]++;
            else if (daysSinceShip <= 5) ageDist["4-5"]++;
            else if (daysSinceShip <= 7) ageDist["6-7"]++;
            else ageDist[">7"]++;

            // Tag Logic
            let tags = [];
            if (Array.isArray(o.order_tags)) {
                tags = o.order_tags.map(t => typeof t === 'object' ? (t.name || t.text || t.label || String(t)) : String(t));
            } else if (typeof o.order_tags === 'string') {
                tags = o.order_tags.split(/[,●\n|]+/).map(t => t.trim());
            }

            // Check fail tags patterns including return/cancel reasons
            const failKeywords = [
                "not my order", "did not order", "cancel", "hủy", "huy",
                "đã hoàn", "thất lạc", "mất", "already", "alredy",
                "no longer required", "mobile switched off", "person not available",
                "no respon", "giao không thành", "wrong item", "wrong number",
                "rescheduled", "open package request", "refused", "bad address", "location changed"
            ];

            let hasFailTag = false;
            tags.forEach(t => {
                const lowerT = t.toLowerCase();
                failKeywords.forEach(f => {
                    if (lowerT.includes(f)) {
                        hasFailTag = true;
                        // Format tag for the chart
                        const label = f.charAt(0).toUpperCase() + f.slice(1);
                        tagStats[label] = (tagStats[label] || 0) + 1;
                    }
                });
            });

            if (hasFailTag) failTagsCount++;

            const hasAppointment = tags.some(t => t.toLowerCase().includes("hẹn giao") || t.toLowerCase().includes("future delivery"));

            const isReturning = o.latest_status && o.latest_status.toLowerCase() === 'returning';
            const hasHoanDVVC = tags.some(t => t.toLowerCase().includes("hoàn dvvc"));

            // Classification Output Model
            const rowData = {
                order_id: o.order_id,
                page_id: o.page_id,
                tracking_number: o.tracking_number,
                carrier: o.carrier,
                market: o.market,
                city: o.city,
                customer_name: o.customer_name,
                phone: o.phone,
                status: o.latest_status || 'Shipped',
                ship_date: shipDate.toLocaleDateString('vi-VN'),
                last_update: lastUpdateDate.toLocaleDateString('vi-VN') + ' ' + lastUpdateDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                days_since_ship: daysSinceShip,
                days_since_update: daysSinceUpdate,
                all_tags: tags.join(' | '),
                reason: '',
                pos_note: o.pos_note,
                pos_link: o.pos_link
            };

            let categorized = false;

            // B. OVERDUE / STUCK
            if (daysSinceShip > 7) {
                if (isReturning) {
                    rowData.reason = hasHoanDVVC ? "Returning: Đợi kho đối soát hoàn" : `Returning: Đang hoàn quá lâu (>${daysSinceShip} days)`;
                } else {
                    rowData.reason = `Overdue (>7 days)`;
                }
                overdue.push(rowData);
                categorized = true;

                // Stats for charts
                cityDelays[o.city] = (cityDelays[o.city] || 0) + 1;
                carrierDelays[o.carrier] = (carrierDelays[o.carrier] || 0) + 1;
            }

            // C. APPOINTMENT FOLLOW
            if (!categorized && hasAppointment) {
                if (daysSinceUpdate >= 3) {
                    rowData.reason = `Stuck after appointment (>=3 days)`;
                    // "If order has tag 'Đã hẹn giao' and still no final status after 3 days -> STUCK AFTER APPOINTMENT."
                    // Wait, the prompt says "mark as STUCK AFTER APPOINTMENT" which implies OVERDUE/STUCK? or Appointment? Let's put in Appointment Follow with high priority
                    appointment.push(rowData);
                    categorized = true;
                } else if (daysSinceUpdate >= 2) {
                    rowData.reason = `Needs follow after appointment (>=2 days)`;
                    appointment.push(rowData);
                    categorized = true;
                }
            }

            // A. NEED FOLLOW
            if (!categorized) {
                if ((daysSinceShip >= 6 && daysSinceShip <= 7) ||
                    (hasFailTag && daysSinceUpdate >= 2) ||
                    (daysSinceUpdate > 3)) {

                    if (isReturning) {
                        rowData.reason = hasHoanDVVC ? "Returning: Đợi kho đối soát hoàn" : "Returning: Đang hoàn cần check lộ trình";
                    } else if (daysSinceShip >= 6 && daysSinceShip <= 7) rowData.reason = `Shipment age 6-7 days`;
                    else if (hasFailTag && daysSinceUpdate >= 2) rowData.reason = `Failed tag + no update 2 days`;
                    else if (daysSinceUpdate > 3) rowData.reason = `No update > 3 days`;

                    needFollow.push(rowData);
                    categorized = true;
                }
            }
        });

        const avgGlobal = deliveredCount > 0 ? (totalDeliveryDays / deliveredCount).toFixed(1) : 0;

        // Sort arrays descending by delay severity
        overdue.sort((a, b) => b.days_since_ship - a.days_since_ship);
        needFollow.sort((a, b) => b.days_since_ship - a.days_since_ship);
        appointment.sort((a, b) => b.days_since_update - a.days_since_update);

        return {
            needFollow, overdue, appointment,
            totalInProgress, failTagsCount, avgGlobal,
            cityDelays, carrierDelays, ageDist, cityDeliveryTimes, carrierDeliveryTimes, tagStats, cityStats
        };
    }

    // Chart instances cache
    let charts = {};

    function renderDashboard(res) {
        // Render Summary
        document.getElementById('d_total').textContent = res.totalInProgress;
        document.getElementById('d_need_follow').textContent = res.needFollow.length;
        document.getElementById('d_overdue').textContent = res.overdue.length;
        document.getElementById('d_appt').textContent = res.appointment.length;
        document.getElementById('d_fail_tags').textContent = res.failTagsCount;
        document.getElementById('d_avg_time').textContent = res.avgGlobal + 'd';


        function populateExcelFilters(group, data) {
            const tableElement = document.querySelector(`table[data-group="${group}"]`);
            if (!tableElement) return;

            const cols = ['all_tags', 'status', 'days_since_ship', 'days_since_update', 'reason', 'carrier'];
            cols.forEach(col => {
                const container = tableElement.querySelector(`.excel-filter[data-col="${col}"]`);
                if (!container) return;

                const dropdown = container.querySelector('.ef-dropdown');
                if (!dropdown) return;

                // Get unique values sorted
                let uniques = [];
                if (col === 'all_tags') {
                    const tagSet = new Set();
                    data.forEach(o => {
                        if (o.all_tags) o.all_tags.split(' | ').forEach(t => { if (t) tagSet.add(t); });
                    });
                    uniques = [...tagSet].sort();
                } else if (col === 'days_since_ship' || col === 'days_since_update') {
                    uniques = [...new Set(data.map(o => o[col]))].filter(x => x !== null && x !== undefined).sort((a, b) => b - a); // Descending for days
                } else {
                    uniques = [...new Set(data.map(o => o[col]))].filter(Boolean).sort();
                }

                // Preserve checked states before rewriting
                const oldSelectAll = dropdown.querySelector('.ef-select-all');
                const wasAllChecked = oldSelectAll ? oldSelectAll.checked : true;

                const existingCheckboxes = dropdown.querySelectorAll('input:not(.ef-select-all)');
                const hadOptions = existingCheckboxes.length > 0;
                let existingChecked = [];
                if (hadOptions) existingChecked = Array.from(existingCheckboxes).filter(i => i.checked).map(i => i.value);

                let html = '';
                uniques.forEach(val => {
                    // It's checked if it's the first time OR 'Select All' was ticked OR it was previously ticked
                    const isChecked = !hadOptions || wasAllChecked || existingChecked.includes(String(val));
                    const checkedStr = isChecked ? 'checked' : '';
                    html += `<label><input type="checkbox" value="${val}" ${checkedStr}> ${val}</label>`;
                });

                const allChecked = !hadOptions || existingChecked.length === existingCheckboxes.length;
                const allHTML = `<label style="border-bottom: 1px dashed #475569; padding-bottom: 4px; margin-bottom: 4px; color: var(--accent); font-weight: bold;">
                    <input type="checkbox" class="ef-select-all" value="ALL" ${allChecked ? 'checked' : ''}> <i>(Select/Clear All)</i>
                </label>`;

                dropdown.innerHTML = allHTML + html;

                // Add change listeners to checkboxes
                const selectAllChk = dropdown.querySelector('.ef-select-all');
                const normalChks = dropdown.querySelectorAll('input:not(.ef-select-all)');

                selectAllChk.addEventListener('change', (e) => {
                    normalChks.forEach(chk => chk.checked = e.target.checked);
                    updateHeader(container);
                    renderLocalTableOnly(group);
                });

                normalChks.forEach(chk => {
                    chk.addEventListener('change', () => {
                        selectAllChk.checked = Array.from(normalChks).every(c => c.checked);
                        updateHeader(container);
                        renderLocalTableOnly(group);
                    });
                });
                updateHeader(container);
            });
        }

        function updateHeader(container) {
            const header = container.querySelector('.ef-header');
            const chks = Array.from(container.querySelectorAll('input:not(.ef-select-all)'));
            const checkedChks = chks.filter(c => c.checked);
            if (checkedChks.length === chks.length || chks.length === 0) header.textContent = 'All';
            else if (checkedChks.length === 0) header.textContent = 'None';
            else if (checkedChks.length === 1) header.textContent = checkedChks[0].value;
            else header.textContent = 'Multiple (' + checkedChks.length + ')';
        }


        populateExcelFilters('needFollow', res.needFollow);
        populateExcelFilters('overdue', res.overdue);
        populateExcelFilters('appointment', res.appointment);

        // Render Tables handled by local isolated components
        renderLocalTableOnly('needFollow');
        renderLocalTableOnly('overdue');
        renderLocalTableOnly('appointment');

        // Draw Charts
        // Draw Charts
        drawChart('chartCities', 'bar', 'Most Delayed Orders by City', res.cityDelays);
        drawChart('chartCarriers', 'pie', 'Delayed by Carrier', res.carrierDelays);
        drawChart('chartAge', 'doughnut', 'Order Age Distribution', res.ageDist);

        const avgCityObj = {};
        for (let k in res.cityDeliveryTimes) avgCityObj[k] = (res.cityDeliveryTimes[k].total / res.cityDeliveryTimes[k].count).toFixed(1);
        drawChart('chartAvgCity', 'bar', 'Avg Delivery Time by City (Days)', avgCityObj);

        // Tag Return Rate Chart Configuration
        const tagMap = res.tagStats;
        let tsNames = [];
        let tsValues = [];

        // Filter out tags with insufficient data (< 3 total orders) and sort by return rate descending
        const validTags = Object.keys(tagMap)
            .filter(t => tagMap[t].total >= 3)
            .map(t => ({
                tag: t,
                total: tagMap[t].total,
                returned: tagMap[t].returned,
                rate: (tagMap[t].returned / tagMap[t].total) * 100
            }))
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 25); // Limit visual bloat

        tsNames = validTags.map(v => v.tag.length > 35 ? v.tag.substring(0, 35) + '...' : v.tag);
        // values are percentages
        tsValues = validTags.map(v => v.rate.toFixed(1));

        const tagChartBox = document.getElementById('chartTagReturnWrapper') || document.getElementById('chartTagReturn').parentElement;
        // Increase pixel step to guarantee vertical bar spacing ~0.25cm 
        tagChartBox.style.height = (validTags.length * 60 + 100) + 'px';

        if (charts['chartTagReturn']) charts['chartTagReturn'].destroy();
        charts['chartTagReturn'] = new Chart(document.getElementById('chartTagReturn'), {
            type: 'bar',
            data: {
                labels: tsNames,
                datasets: [{
                    label: 'Return Rate (%)',
                    data: tsValues,
                    barPercentage: 0.5,
                    categoryPercentage: 0.7,
                    backgroundColor: validTags.map(v => {
                        if (v.rate >= 90) return '#ef4444';
                        if (v.rate >= 75) return '#f97316';
                        if (v.rate >= 50) return '#eab308';
                        return '#3b82f6';
                    }),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // horizontal bar chart
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Tỷ lệ Hoàn Theo Nguyên Nhân (% Returned)', color: '#0f172a', font: { size: 16 } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const tagObj = validTags[ctx.dataIndex];
                                return `Returned: ${tagObj.returned} / ${tagObj.total} orders (${tagObj.rate.toFixed(1)}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#475569', font: { size: 13 } }, grid: { color: 'rgba(0,0,0,0.1)' }, min: 0, max: 100 },
                    y: {
                        ticks: { color: '#1e293b', font: { size: 14, weight: '600' }, autoSkip: false, maxRotation: 0 },
                        grid: { display: false },
                        afterFit: (axis) => { axis.width = 300; }
                    }
                }
            }
        });

        // City Return Rate Chart Configuration
        const cityMap = res.cityStats;
        const validCities = Object.keys(cityMap)
            .filter(c => cityMap[c].total >= 5) // At least 5 orders to show stats
            .map(c => ({
                city: c,
                total: cityMap[c].total,
                returned: cityMap[c].returned,
                rate: (cityMap[c].returned / cityMap[c].total) * 100
            }))
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 30); // Show top 30 cities

        const cNames = validCities.map(v => v.city.length > 35 ? v.city.substring(0, 35) + '...' : v.city);
        const cValues = validCities.map(v => v.rate.toFixed(1));

        const cityChartBox = document.getElementById('chartCityReturnWrapper') || document.getElementById('chartCityReturn').parentElement;
        cityChartBox.style.height = (validCities.length * 60 + 100) + 'px';

        if (charts['chartCityReturn']) charts['chartCityReturn'].destroy();
        charts['chartCityReturn'] = new Chart(document.getElementById('chartCityReturn'), {
            type: 'bar',
            data: {
                labels: cNames,
                datasets: [{
                    label: 'Return Rate (%)',
                    data: cValues,
                    barPercentage: 0.5,
                    categoryPercentage: 0.7,
                    backgroundColor: validCities.map(v => {
                        if (v.rate >= 50) return '#ef4444';
                        if (v.rate >= 30) return '#f97316';
                        if (v.rate >= 15) return '#eab308';
                        return '#10b981';
                    }),
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y', // horizontal bar chart
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Tỷ lệ Hoàn Tại Các Tỉnh/Thành (% Returned)', color: '#0f172a', font: { size: 16 } },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                const cObj = validCities[ctx.dataIndex];
                                return `Returned: ${cObj.returned} / ${cObj.total} orders (${cObj.rate.toFixed(1)}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#475569', font: { size: 13 } }, grid: { color: 'rgba(0,0,0,0.1)' }, min: 0, max: 100 },
                    y: {
                        ticks: { color: '#1e293b', font: { size: 14, weight: '600' }, autoSkip: false, maxRotation: 0 },
                        grid: { display: false },
                        afterFit: (axis) => { axis.width = 280; }
                    }
                }
            }
        });


    }

    // === TRACKING DATA AND PAGINATION STATE ===
    function getTrackerData() {
        try { return JSON.parse(localStorage.getItem('delay_tracking_data') || '{}'); } catch (e) { return {}; }
    }
    function setTrackerData(d) { localStorage.setItem('delay_tracking_data', JSON.stringify(d)); }

    window.delayToolToggleDone = function (id, group) {
        const d = getTrackerData();
        if (!d[id]) d[id] = { follow: 0, note: '' };
        if (d[id].done !== undefined) { d[id].follow = d[id].done ? 3 : 0; delete d[id].done; }

        d[id].follow = ((d[id].follow || 0) + 1) % 4;

        setTrackerData(d);
        if (window.delayModule && window.delayModule.renderLocalTableOnly) window.delayModule.renderLocalTableOnly(group);
    };

    window.delayToolSaveNote = function (id, el) {
        const d = getTrackerData();
        if (!d[id]) d[id] = { follow: 0, note: '' };
        if (d[id].done !== undefined) { d[id].follow = d[id].done ? 3 : 0; delete d[id].done; }
        d[id].note = el.value;
        setTrackerData(d);
    };

    if (typeof window._delayPagination === 'undefined') {
        window._delayPagination = { needFollow: 1, overdue: 1, appointment: 1 };
    }

    function buildRow(keys, o, group, trackerState) {
        const trk = trackerState[o.order_id] || { follow: 0, note: '' };
        if (trk.done !== undefined) { trk.follow = trk.done ? 3 : 0; }

        let rowStyle = '';
        let btnText = '📍 Chưa follow';
        let btnStyle = 'background: #e2e8f0; color: #475569;';

        const f = trk.follow || 0;
        if (f === 1) {
            rowStyle = 'background-color: rgba(234, 179, 8, 0.12);'; // Yellow
            btnText = 'Đã follow Lần 1';
            btnStyle = 'background: #eab308; color: #fff;';
        } else if (f === 2) {
            rowStyle = 'background-color: rgba(249, 115, 22, 0.12);'; // Orange
            btnText = 'Đã follow Lần 2';
            btnStyle = 'background: #f97316; color: #fff;';
        } else if (f === 3) {
            rowStyle = 'background-color: rgba(16, 185, 129, 0.12);'; // Green
            btnText = '✔ Đã follow Lần 3 (Max)';
            btnStyle = 'background: #10b981; color: #fff;';
        }

        let rowHtml = keys.map(k => {
            if (k === 'order_id') {
                return `<td>
                    <span style="font-weight:bold;">${o[k]}</span>
                    <button onclick="navigator.clipboard.writeText('${o[k]}'); this.innerText='Copied!';" style="font-size:10px; padding:2px 5px; margin-left:5px; cursor:pointer; background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a; border-radius:3px;" title="Copy">Copy</button>
                </td>`;
            }
            if (k === 'tracking_number' && o[k] !== 'N/A') {
                if (o[k].includes('http') || o[k].includes('/') || o[k].length > 20) {
                    return `<td><span style="color:#64748b; font-style:italic;">(Pending)</span></td>`;
                }
                return `<td>
                    <span style="font-family:monospace;">${o[k]}</span>
                    <button onclick="navigator.clipboard.writeText('${o[k]}'); this.innerText='Copied!';" style="font-size:10px; padding:2px 5px; margin-left:5px; cursor:pointer; background:#f1f5f9; border:1px solid #cbd5e1; color:#0f172a; border-radius:3px;" title="Copy">Copy</button>
                </td>`;
            }
            return `<td>${o[k]}</td>`;
        }).join('');

        let posLink = o.pos_link || `https://pos.pancake.vn/shop/${SHOP_ID}/order?order_id=${o.order_id}`;

        let customLink;
        if (o.conversation_link) customLink = o.conversation_link;
        else if (o.customer_id) customLink = `https://pancake.vn/${o.page_id}?customer_id=${o.customer_id}`;
        else customLink = `https://pancake.vn/${o.page_id}?order=${o.order_id}`;

        const actions = `<div style="display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; gap:6px;">
                <a href="${customLink}" target="_blank" style="flex:1; background:#0284c7; padding:8px; border-radius:4px; color:#fff; text-decoration:none; text-align:center; font-weight:bold; font-size:12px;">Open Chat</a>
                <a href="${posLink}" target="_blank" style="flex:1; background:#d97706; padding:8px; border-radius:4px; color:#fff; text-decoration:none; text-align:center; font-weight:bold; font-size:12px;">Open POS</a>
            </div>
            <div style="border-top:1px solid rgba(0,0,0,0.1); padding-top:6px;">
                <button onclick="delayToolToggleDone('${o.order_id}', '${group}')" style="width:100%; border:none; padding:8px; border-radius:4px; font-weight:bold; font-size:13px; cursor:pointer; ${btnStyle}">
                    ${btnText}
                </button>
                <input type="text" placeholder="Ghi chú nhanh..." value="${(trk.note || '').replace(/"/g, '&quot;')}" oninput="delayToolSaveNote('${o.order_id}', this)" style="width:100%; border-radius:4px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; padding:10px; font-size:14px; margin-top:8px;">
            </div>
        </div>`;
        return `<tr style="${rowStyle}">${rowHtml}<td>${actions}</td></tr>`;
    }


    function getLocalFilteredData(group) {
        if (!window._currentDelayResults || !window._currentDelayResults[group]) return [];
        const baseData = window._currentDelayResults[group];

        const tableElement = document.querySelector(`table[data-group="${group}"]`);
        if (!tableElement) return baseData;

        const fCustomer = tableElement.querySelector('.tbl-filter-customer') ? tableElement.querySelector('.tbl-filter-customer').value.toLowerCase().trim() : '';

        const getCheckedInfo = (col) => {
            const c = tableElement.querySelector(`.excel-filter[data-col="${col}"]`);
            if (!c) return null;
            const checkboxes = Array.from(c.querySelectorAll('input:not(.ef-select-all)'));
            if (checkboxes.length === 0) return null;
            const checked = checkboxes.filter(i => i.checked).map(i => i.value);
            return { checked, total: checkboxes.length };
        };

        const fTagsInfo = getCheckedInfo('all_tags');
        const fStatusInfo = getCheckedInfo('status');
        const fDaysShipStrInfo = getCheckedInfo('days_since_ship');
        const fDaysUpdStrInfo = getCheckedInfo('days_since_update');
        const fReasonInfo = getCheckedInfo('reason');
        const fCarrierStrInfo = getCheckedInfo('carrier');

        return baseData.filter(o => {
            if (fCustomer && !String(o.customer_name).toLowerCase().includes(fCustomer)) return false;

            if (fTagsInfo && fTagsInfo.checked.length < fTagsInfo.total) {
                if (fTagsInfo.checked.length === 0) return false;
                let tagsStr = String(o.all_tags);
                if (!fTagsInfo.checked.some(t => tagsStr.includes(t))) return false;
            }

            if (fStatusInfo && fStatusInfo.checked.length < fStatusInfo.total) {
                if (fStatusInfo.checked.length === 0) return false;
                if (!fStatusInfo.checked.includes(o.status)) return false;
            }
            if (fDaysShipStrInfo && fDaysShipStrInfo.checked.length < fDaysShipStrInfo.total) {
                if (fDaysShipStrInfo.checked.length === 0) return false;
                if (!fDaysShipStrInfo.checked.includes(String(o.days_since_ship))) return false;
            }
            if (fDaysUpdStrInfo && fDaysUpdStrInfo.checked.length < fDaysUpdStrInfo.total) {
                if (fDaysUpdStrInfo.checked.length === 0) return false;
                if (!fDaysUpdStrInfo.checked.includes(String(o.days_since_update))) return false;
            }
            if (fReasonInfo && fReasonInfo.checked.length < fReasonInfo.total) {
                if (fReasonInfo.checked.length === 0) return false;
                if (!fReasonInfo.checked.includes(o.reason)) return false;
            }
            if (fCarrierStrInfo && fCarrierStrInfo.checked.length < fCarrierStrInfo.total) {
                if (fCarrierStrInfo.checked.length === 0) return false;
                if (!fCarrierStrInfo.checked.includes(o.carrier)) return false;
            }

            return true;
        });
    }


    function renderLocalTableOnly(group) {
        let tbodyId = "";
        if (group === 'needFollow') tbodyId = 'delayNeedFollowTbody';
        else if (group === 'overdue') tbodyId = 'delayOverdueTbody';
        else if (group === 'appointment') tbodyId = 'delayApptTbody';

        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;

        let data = getLocalFilteredData(group);

        // Push 'done/followed' items to the bottom depending on follow magnitude
        const trackerState = getTrackerData();
        data.sort((a, b) => {
            const trkA = trackerState[a.order_id] || {};
            const trkB = trackerState[b.order_id] || {};
            const fA = trkA.follow || (trkA.done ? 3 : 0);
            const fB = trkB.follow || (trkB.done ? 3 : 0);
            return fA - fB;
        });

        const total = data.length;
        const limit = 50;
        const maxPage = Math.ceil(total / limit) || 1;

        let p = window._delayPagination[group] || 1;
        if (p > maxPage) p = maxPage;
        window._delayPagination[group] = p;

        const pagedData = data.slice((p - 1) * limit, p * limit);

        tbody.innerHTML = pagedData.map(o => buildRow(['order_id', 'tracking_number', 'carrier', 'city', 'customer_name', 'all_tags', 'status', 'ship_date', 'days_since_ship', 'days_since_update', 'reason', 'pos_note'], o, group, trackerState)).join('');

        const tableCard = tbody.closest('.table-card');
        if (tableCard) {
            const countSpan = tableCard.querySelector('.tbl-count');
            if (countSpan) countSpan.textContent = `(Showing ${pagedData.length} of ${total})`;

            // Inject Pagination Controls
            let pgDiv = tableCard.querySelector('.pagination-controls');
            if (!pgDiv) {
                pgDiv = document.createElement('div');
                pgDiv.className = 'pagination-controls';
                pgDiv.style.cssText = "display: flex; gap: 8px; align-items: center; justify-content: center; padding: 12px; background: var(--bg-card); border-top: 1px solid var(--border);";
                tableCard.appendChild(pgDiv);
            }

            const btnStyle = "padding:4px 12px; background:var(--accent); color:white; border-radius:4px; border:none; cursor:pointer;";
            const disabledStyle = "padding:4px 12px; background:var(--border); color:#64748b; border-radius:4px; border:none; cursor:not-allowed;";

            pgDiv.innerHTML = `
                <div style="flex: 1; color: #334155; font-size: 13px; font-weight: 600;">Tổng: <b>${total}</b> đơn &nbsp;|&nbsp; Trang ${p} / ${maxPage}</div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window._delayPagination['${group}'] = 1; window.delayModule.renderLocalTableOnly('${group}')" style="${p === 1 ? disabledStyle : btnStyle}" ${p === 1 ? 'disabled' : ''}>First</button>
                    <button onclick="window._delayPagination['${group}'] = ${p - 1}; window.delayModule.renderLocalTableOnly('${group}')" style="${p === 1 ? disabledStyle : btnStyle}" ${p === 1 ? 'disabled' : ''}>Prev</button>
                    <span style="color: var(--text-base, #334155); font-weight:bold; margin: 0 4px; display:flex; align-items:center;">Page ${p} / ${maxPage}</span>
                    <button onclick="window._delayPagination['${group}'] = ${p + 1}; window.delayModule.renderLocalTableOnly('${group}')" style="${p === maxPage ? disabledStyle : btnStyle}" ${p === maxPage ? 'disabled' : ''}>Next</button>
                    <button onclick="window._delayPagination['${group}'] = ${maxPage}; window.delayModule.renderLocalTableOnly('${group}')" style="${p === maxPage ? disabledStyle : btnStyle}" ${p === maxPage ? 'disabled' : ''}>Last</button>
                </div>
            `;
        }
    }

    function drawChart(canvasId, type, title, dataObj) {
        const ctx = document.getElementById(canvasId);
        if (charts[canvasId]) charts[canvasId].destroy();

        const labels = Object.keys(dataObj);
        const data = Object.values(dataObj);

        charts[canvasId] = new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: title,
                    data: data,
                    backgroundColor: ['#7dd3fc', '#facc15', '#ef4444', '#a855f7', '#4ade80', '#fb923c', '#94a3b8'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: type !== 'bar',
                        position: 'right',
                        labels: { color: '#475569', font: { size: 10 } }
                    },
                    title: {
                        display: true,
                        text: title,
                        color: '#334155',
                        font: { size: 14, weight: 'bold' }
                    }
                }
            }
        });
    }

    function exportToCSV(filename, rows) {
        if (!rows || !rows.length) return;
        const separator = ',';
        const keys = Object.keys(rows[0]);
        const csvContent =
            keys.join(separator) +
            '\n' +
            rows.map(row => {
                return keys.map(k => {
                    let cell = row[k] === null || row[k] === undefined ? '' : row[k];
                    cell = cell instanceof Date ? cell.toLocaleString() : cell.toString().replace(/"/g, '""');
                    if (cell.search(/("|,|\n)/g) >= 0) { cell = `"${cell}"`; }
                    return cell;
                }).join(separator);
            }).join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    function exportData() {
        if (!window._currentDelayResults) {
            alert("Please Fetch Data first.");
            return;
        }
        const res = window._currentDelayResults;
        const exportRows = [];

        function mapForExport(o, priorityStr) {
            return {
                "Order ID": o.order_id,
                "Tracking": o.tracking_number,
                "Carrier": o.carrier,
                "City": o.city,
                "Current Status": o.status,
                "Ship Date": o.ship_date,
                "Last Update": o.last_update,
                "Days Since Ship": o.days_since_ship,
                "Days Since Last Update": o.days_since_update,
                "All Tags": o.all_tags,
                "Follow Reason": o.reason,
                "POS Note": o.pos_note,
                "Priority": priorityStr
            };
        }

        res.overdue.forEach(o => exportRows.push(mapForExport(o, 'HIGH - OVERDUE')));
        res.appointment.forEach(o => exportRows.push(mapForExport(o, 'HIGH - APPOINTMENT')));
        res.needFollow.forEach(o => exportRows.push(mapForExport(o, 'MEDIUM - FOLLOW')));

        exportToCSV("FOLLOW_TO_CARRIER.csv", exportRows);
    }

    function exportLocal(group) {
        const data = getLocalFilteredData(group);
        if (!data || data.length === 0) {
            alert("No data available to export for this selection.");
            return;
        }

        const exportRows = data.map(o => {
            return {
                "Order ID": o.order_id,
                "Tracking": o.tracking_number,
                "Carrier": o.carrier,
                "City": o.city,
                "Current Status": o.status,
                "Ship Date": o.ship_date,
                "Last Update": o.last_update,
                "Days Since Ship": o.days_since_ship,
                "Days Since Last Update": o.days_since_update,
                "All Tags": o.all_tags,
                "Follow Reason": o.reason,
                "POS Note": o.pos_note,
                "Priority": group.toUpperCase()
            };
        });

        const safeDate = new Date().toISOString().slice(0, 10);
        exportToCSV(`Carrier_Export_${group}_${safeDate}.csv`, exportRows);
    }

    // Auto refresh every 5 mins
    setInterval(() => {
        if (!document.getElementById('tab-delay').classList.contains('hidden')) {
            const statusEl = document.getElementById('delayStatus');
            if (statusEl.innerHTML.includes('Showing') || statusEl.innerHTML.includes('Success')) {
                runDelayCheck();
            }
        }
    }, 300000);

    // Bind instantaneous filter events
    ['filterMarket', 'filterCarrier', 'filterCity', 'filterStatus', 'filterTag', 'filterDateFrom', 'filterDateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', applyFilters);
            el.addEventListener('input', applyFilters);
        }
    });

    document.querySelectorAll('.tbl-filter-customer').forEach(el => {
        el.addEventListener('input', () => {
            const group = el.closest('table').getAttribute('data-group');
            if (group) renderLocalTableOnly(group);
        });
    });

    // Global dropdown toggle logic (extracted from render cycle to prevent duplication)
    document.addEventListener('click', e => {
        const isHeader = e.target.closest('.ef-header');
        if (isHeader) {
            const drop = isHeader.nextElementSibling;
            const isVis = drop.style.display === 'block';
            document.querySelectorAll('.ef-dropdown').forEach(d => d.style.display = 'none');
            drop.style.display = isVis ? 'none' : 'block';
            return;
        }
        if (!e.target.closest('.excel-filter')) {
            document.querySelectorAll('.ef-dropdown').forEach(d => d.style.display = 'none');
        }
    });

    // Auto-fetch on page load if Delay Orders is active tab, or just wait for explicit tab click
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const cache = await loadFromIndexedDB();
            if (cache && cache.data && cache.data.length > 0) {
                _allFetchedOrders = cache.data;
                const ageMins = Math.floor((Date.now() - parseInt(cache.time || Date.now())) / 60000);
                document.getElementById('delayStatus').innerHTML = `Loaded ${_allFetchedOrders.length} orders from cache (${ageMins} mins ago). Nhấn 'Fetch & Analyze' để làm mới.`;
                populateFilterDropdowns();
                applyFilters();
            } else {
                document.getElementById('delayStatus').innerHTML = `Không có dữ liệu lưu trữ. Nhấn 'Fetch & Analyze' để bắt đầu.`;
            }
        } catch (e) {
            console.error('Failed to load cache:', e);
        }
    });

    return { runDelayCheck, exportData, applyFilters, exportLocal, renderLocalTableOnly };
})();
