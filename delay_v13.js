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
    ]; // final_status and final_status_time can be null if not delivered/returned

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
            created_at: raw.inserted_at || raw.created_at || null,
            shipped_at: raw.time_send_partner || raw.shipped_at || null,
            latest_status: raw.status_name || raw.status || "Unknown",
            latest_status_time: raw.updated_at || raw.latest_status_time || null,
            final_status: checkFinalStatus(raw.status_name || raw.status),
            final_status_time: checkFinalStatus(raw.status_name || raw.status) ? (raw.updated_at || raw.latest_status_time) : null,
            order_tags: raw.tags || raw.order_tags || [],
            order_tags: raw.tags || raw.order_tags || [],
            shop_id: raw.shop_id || SHOP_ID,
            page_id: raw.page_id || (raw.page && raw.page.id) || "1029988856864809",
            conversation_link: (raw.customer && raw.customer.conversation_link) || null
        };
    }

    function checkFinalStatus(status) {
        if (!status) return null;
        const s = status.toString().toLowerCase();
        if (s.includes('delivered') || s.includes('received') || s.includes('đã giao') || s === '8') return 'Delivered';
        if (s.includes('returned') || s.includes('đã hoàn') || s === '7' || s === '9') return 'Returned';
        return null;
    }

    let _allFetchedOrders = [];

    async function runDelayCheck() {
        const statusEl = document.getElementById('delayStatus');
        const debugEl = document.getElementById('delayDebug');

        statusEl.innerHTML = "Fetching POS data...";
        debugEl.innerHTML = "";
        _allFetchedOrders = [];

        const logDebug = (msg) => {
            debugEl.innerHTML += `<div><span style="color:#facc15">[DEBUG]</span> ${msg}</div>`;
            console.log(`[DEBUG] ${msg}`);
        };

        try {
            let allRawOrders = [];
            let page = 1;
            let totalPages = 1;
            const MAX_PAGES = 50; // Guard against infinite loops

            while (page <= totalPages && page <= MAX_PAGES) {
                statusEl.innerHTML = `Fetching POS data... Page ${page} of ${totalPages}`;
                const apiUrl = `https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/orders?api_key=${API_KEY}&page_number=${page}&page_size=100`;

                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error("HTTP " + response.status);

                let data = await response.json();

                if (page === 1) {
                    totalPages = data.total_pages || 1;
                    logDebug(`API Pagination: Total Pages = ${totalPages}, Total Entries = ${data.total_entries || 'N/A'}`);
                }

                let rawOrders = Array.isArray(data) ? data : (data.data || data.orders || []);
                if (rawOrders.length === 0) break;

                allRawOrders.push(...rawOrders);
                page++;
            }

            logDebug(`Number of pages fetched: ${page - 1}`);
            logDebug(`Total raw orders fetched from API: ${allRawOrders.length}`);

            if (allRawOrders.length === 0) {
                statusEl.innerHTML = "No orders found.";
                return;
            }

            // Map the raw POS API schema to the required User Schema
            _allFetchedOrders = allRawOrders.map(mapPancakeOrder);

            // Print sample mapped fields (first order)
            if (_allFetchedOrders.length > 0) {
                const s = _allFetchedOrders[0];
                logDebug(`Sample mapped order [${s.order_id}]: Market=${s.market}, Carrier=${s.carrier}, City=${s.city}, Status=${s.latest_status}`);
            }

            statusEl.innerHTML = `Data fetched successfully. Applying filters...`;
            logDebug(`Data cached in memory. Ready for real-time filtering.`);

            populateFilterDropdowns();
            applyFilters();

        } catch (e) {
            console.error(e);
            document.getElementById('delayStatus').innerHTML = `<span style='color:red'>Fetch Error: ${e.message}</span>`;
        }
    }

    function populateFilterDropdowns() {
        if (!_allFetchedOrders || _allFetchedOrders.length === 0) return;

        const markets = [...new Set(_allFetchedOrders.map(o => o.market))].filter(Boolean).sort();
        const carriers = [...new Set(_allFetchedOrders.map(o => o.carrier))].filter(Boolean).sort();
        const cities = [...new Set(_allFetchedOrders.map(o => o.city))].filter(Boolean).sort();

        const buildOptions = (arr, defaultText) => `<option value="" style="color:black">${defaultText}</option>` + arr.map(item => `<option value="${item}" style="color:black">${item}</option>`).join('');

        const mEl = document.getElementById('filterMarket');
        const cEl = document.getElementById('filterCarrier');
        const ciEl = document.getElementById('filterCity');

        const curM = mEl ? mEl.value : "";
        const curC = cEl ? cEl.value : "";
        const curCi = ciEl ? ciEl.value : "";

        if (mEl) { mEl.innerHTML = buildOptions(markets, 'All Markets'); mEl.value = curM; }
        if (cEl) { cEl.innerHTML = buildOptions(carriers, 'All Carriers'); cEl.value = curC; }
        if (ciEl) { ciEl.innerHTML = buildOptions(cities, 'All Cities'); ciEl.value = curCi; }
    }

    function applyFilters() {
        if (!_allFetchedOrders || _allFetchedOrders.length === 0) return;

        const fMarket = document.getElementById('filterMarket').value.toLowerCase().trim();
        const fCarrier = document.getElementById('filterCarrier').value.toLowerCase().trim();
        const fCity = document.getElementById('filterCity').value.toLowerCase().trim();
        const fFrom = document.getElementById('filterDateFrom').value;
        const fTo = document.getElementById('filterDateTo').value;

        let orders = _allFetchedOrders.filter(o => {
            if (fMarket && !String(o.market).toLowerCase().includes(fMarket)) return false;
            if (fCarrier && !String(o.carrier).toLowerCase().includes(fCarrier)) return false;
            if (fCity && !String(o.city).toLowerCase().includes(fCity)) return false;

            if (fFrom || fTo) {
                if (!o.shipped_at) return false;
                const sDate = new Date(o.shipped_at);
                if (fFrom && sDate < new Date(fFrom)) return false;
                if (fTo) {
                    const tDate = new Date(fTo);
                    tDate.setDate(tDate.getDate() + 1); // include the whole day
                    if (sDate >= tDate) return false;
                }
            }
            return true;
        });

        const statusEl = document.getElementById('delayStatus');
        statusEl.innerHTML = `Analyzing ${orders.length} filtered orders...`;
        const results = processLogic(orders);
        renderDashboard(results);
        window._currentDelayResults = results; // Save for export

        statusEl.innerHTML = `<span style='color:#4ade80'>Showing ${orders.length} matching orders (Out of ${_allFetchedOrders.length} fetched). Last updated: ${new Date().toLocaleTimeString()}</span>`;
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

        orders.forEach(o => {
            // Explicitly drop cancelled or unconfirmed orders based on user instructions
            const dropStatuses = ["đợi xác nhận", "đã xác nhận", "hủy", "cancel", "hủy đơn", "đã hủy", "mới", "new", "submitted", "packing", "đóng hàng", "wait submit", "wait_submit", "chờ chuyển", "chờ lấy"];
            if (o.latest_status && dropStatuses.some(ds => o.latest_status.toLowerCase().includes(ds))) return;

            // Do NOT track orders before shipped status
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

            // Check fail tags patterns
            const failKeywords = ["not my order", "did not order", "cancel", "no longer required", "mobile switched off", "person not available", "no respon", "giao không thành"];
            const hasFailTag = tags.some(t => failKeywords.some(f => t.toLowerCase().includes(f)));
            if (hasFailTag) failTagsCount++;

            const hasAppointment = tags.some(t => t.toLowerCase().includes("hẹn giao") || t.toLowerCase().includes("future delivery"));

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
                reason: ''
            };

            let categorized = false;

            // B. OVERDUE / STUCK
            if (daysSinceShip > 7) {
                rowData.reason = `Overdue (>7 days)`;
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

                    if (daysSinceShip >= 6 && daysSinceShip <= 7) rowData.reason = `Shipment age 6-7 days`;
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
            cityDelays, carrierDelays, ageDist, cityDeliveryTimes, carrierDeliveryTimes
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

        // Render Tables
        function buildRow(keys, o) {
            let rowHtml = keys.map(k => {
                if (k === 'order_id') {
                    // Make Order ID copyable
                    return `<td>
                        <span style="font-weight:bold;">${o[k]}</span>
                        <button onclick="navigator.clipboard.writeText('${o[k]}'); this.innerText='Copied!';" style="font-size:10px; padding:2px 5px; margin-left:5px; cursor:pointer;" title="Copy">Copy</button>
                    </td>`;
                }
                if (k === 'tracking_number' && o[k] !== 'N/A') {
                    if (o[k].includes('http') || o[k].includes('/') || o[k].length > 20) {
                        return `<td><span style="color:#94a3b8; font-style:italic;">(Pending)</span></td>`;
                    }
                    return `<td>
                        <span style="font-family:monospace;">${o[k]}</span>
                        <button onclick="navigator.clipboard.writeText('${o[k]}'); this.innerText='Copied!';" style="font-size:10px; padding:2px 5px; margin-left:5px; cursor:pointer;" title="Copy">Copy</button>
                    </td>`;
                }
                return `<td>${o[k]}</td>`;
            }).join('');

            // Action Link: native format matching the Web Chat Inbox perfectly
            let customLink = `https://pancake.vn/${o.page_id}?order=${o.order_id}`;
            const actions = `<a href="${customLink}" target="_blank" style="color:#7dd3fc; text-decoration:none; font-weight:bold;">Open Chat</a>`;
            return `<tr>${rowHtml}<td>${actions}</td></tr>`;
        }

        const nfBody = document.getElementById('delayNeedFollowTbody');
        nfBody.innerHTML = res.needFollow.map(o => buildRow(['order_id', 'tracking_number', 'carrier', 'city', 'customer_name', 'status', 'ship_date', 'days_since_ship', 'days_since_update', 'reason'], o)).join('');

        const ovBody = document.getElementById('delayOverdueTbody');
        ovBody.innerHTML = res.overdue.map(o => buildRow(['order_id', 'tracking_number', 'carrier', 'city', 'status', 'ship_date', 'days_since_ship', 'days_since_update', 'reason'], o)).join('');

        const apBody = document.getElementById('delayApptTbody');
        apBody.innerHTML = res.appointment.map(o => buildRow(['order_id', 'tracking_number', 'carrier', 'city', 'status', 'last_update', 'days_since_update', 'all_tags', 'reason'], o)).join('');

        // Draw Charts
        drawChart('chartCities', 'bar', 'Most Delayed Orders by City', res.cityDelays);
        drawChart('chartCarriers', 'pie', 'Delayed by Carrier', res.carrierDelays);
        drawChart('chartAge', 'doughnut', 'Order Age Distribution', res.ageDist);

        const avgCityObj = {};
        for (let k in res.cityDeliveryTimes) avgCityObj[k] = (res.cityDeliveryTimes[k].total / res.cityDeliveryTimes[k].count).toFixed(1);
        drawChart('chartAvgCity', 'bar', 'Avg Delivery Time by City (Days)', avgCityObj);
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
            options: { responsive: true, plugins: { legend: { display: type !== 'bar' }, title: { display: true, text: title, color: '#f8fafc' } } }
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
                "Priority": priorityStr
            };
        }

        res.overdue.forEach(o => exportRows.push(mapForExport(o, 'HIGH - OVERDUE')));
        res.appointment.forEach(o => exportRows.push(mapForExport(o, 'HIGH - APPOINTMENT')));
        res.needFollow.forEach(o => exportRows.push(mapForExport(o, 'MEDIUM - FOLLOW')));

        exportToCSV("FOLLOW_TO_CARRIER.csv", exportRows);
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
    ['filterMarket', 'filterCarrier', 'filterCity', 'filterDateFrom', 'filterDateTo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', applyFilters);
            el.addEventListener('input', applyFilters);
        }
    });

    // Auto-fetch on page load if Delay Orders is active tab, or just wait for explicit tab click
    document.addEventListener('DOMContentLoaded', () => {
        // Run immediately in background to populate data early
        setTimeout(runDelayCheck, 1000);
    });

    return { runDelayCheck, exportData, applyFilters };
})();
