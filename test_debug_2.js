const fs = require('fs');
const https = require('https');

function fetchSheet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let jsonStr = data.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
                try {
                    let obj = JSON.parse(jsonStr);
                    let result = obj.table.rows.map(r => {
                        let rowObj = {};
                        (r.c || []).forEach((cell, idx) => {
                            rowObj[`col_${idx}`] = cell ? cell.v : '';
                        });
                        return rowObj;
                    });
                    resolve(result);
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

// Emulate app_v2.js processOrders (just the relevant part)
function getMatchKey(s) {
    if (!s) return null;
    let digits = s.toString().replace(/[^0-9]/g, '');
    let res = digits.substring(digits.length - 8);
    if (res.length < 8) return null;
    return res;
}

async function run() {
    let s2 = await fetchSheet('https://docs.google.com/spreadsheets/d/1s_kiZmo0K4-xVoceA31Bk3YtZ_HiSygjM1D2EF6bjMc/gviz/tq?tqx=out:json&gid=1243266024');
    let s3 = await fetchSheet('https://docs.google.com/spreadsheets/d/1x0PoumhXe0GZCdK7siVVnU-Kw91tEzmbTi2XY9Ud0X0/gviz/tq?tqx=out:json&gid=1648413723');

    let profiles = s2;
    let tagsData = s3;

    const profileMap = new Map();
    let allProfileRows = profiles.concat(tagsData || []);
    let isRawList = false;
    for (let i = 0; i < Math.min(20, profiles.length); i++) {
        const rowStr = Object.values(profiles[i] || {}).join(' ').toLowerCase();
        if (rowStr.match(/(returned|delivered|đã nhận|đã hoàn|returning|canceled|hủy|đã xác nhận|đang đóng hàng|đã gửi hàng|shipped)/)) {
            isRawList = true;
            break;
        }
    }

    if (!isRawList && tagsData) {
        for (let i = 0; i < Math.min(20, tagsData.length); i++) {
            const rowStr = Object.values(tagsData[i] || {}).join(' ').toLowerCase();
            if (rowStr.match(/(returned|delivered|đã nhận|đã hoàn|returning|canceled|hủy|đã xác nhận|đang đóng hàng|đã gửi hàng|shipped)/)) {
                isRawList = true;
                break;
            }
        }
    }

    console.log("isRawList detected:", isRawList);

    if (isRawList) {
        let countedOrders = new Map(); // id -> { phoneKey, nameLow, statusStr }

        // Phase 1: Extract all orders
        allProfileRows.forEach(p => {
            let phoneStr = "";
            let statusStr = "";
            let orderIdStr = "";
            let nameStr = "";

            const vals = Object.values(p).map(v => (v || '').toString().trim());

            // Try to find Name (longest non-numeric string before address)
            // But actually in tagsData, Name is usually at index 3. In profiles, Name is at index 1.
            if (vals.length > 3) {
                // If it's tagsData: [ID, Date, Phone, Name, City, District, Address, ...]
                if (vals[1].includes('Date')) {
                    nameStr = vals[3];
                } else if (vals[2] && vals[2].match(/^\d+$/)) {
                    // profiles: [ID, Name, Phone, ...]
                    nameStr = vals[1];
                }
            }

            vals.forEach(s => {
                if (!s.toLowerCase().includes('date(')) {
                    const mkRaw = getMatchKey(s);
                    if (mkRaw && !phoneStr) phoneStr = mkRaw;
                    if (s.match(/^\d{5,8}$/) && !orderIdStr) orderIdStr = s;
                }
                const sLow = s.toLowerCase();
                if (['returned', 'returning', 'đã hoàn', 'hoàn'].some(x => sLow.includes(x))) statusStr = 'Returned';
                else if (['delivered', 'đã nhận', 'thành công'].some(x => sLow.includes(x))) statusStr = 'Delivered';
                else if (['đã gửi hàng', 'shipped', 'đang giao', 'undeliverable'].some(x => sLow.includes(x))) statusStr = 'Shipped';
                else if (['canceled', 'hủy', 'cancel', 'đã huỷ'].some(x => sLow.includes(x))) statusStr = 'Canceled';
                else if (['đã xác nhận', 'đang đóng hàng', 'chờ', 'mới'].some(x => sLow.includes(x))) statusStr = 'Pending';
            });

            // Name fallback heuristics
            if (!nameStr) {
                // Find first non numeric string > 3 chars
                const potentialName = vals.find(x => x.length > 3 && !x.match(/^[\d\-\+]+$/) && !x.toLowerCase().includes('date'));
                if (potentialName) nameStr = potentialName;
            }

            const mk = getMatchKey(phoneStr);
            if (mk && statusStr && (statusStr === 'Returned' || statusStr === 'Delivered' || statusStr === 'Shipped')) {
                const uniqueId = orderIdStr || Math.random().toString();
                if (!countedOrders.has(uniqueId)) {
                    countedOrders.set(uniqueId, {
                        phoneKey: mk,
                        nameLow: nameStr ? nameStr.toLowerCase().replace(/[^a-z0-9]/g, '') : '',
                        status: statusStr
                    });
                }
            }
        });

        // Phase 2: Group and Merge by Name/Phone
        const entityMap = new Map(); // entityKey -> { total, returned, phones: Set }

        for (const [id, order] of countedOrders.entries()) {
            // Determine entity key: use name if valid, otherwise phone
            let entityKey = (order.nameLow && order.nameLow.length > 5) ? order.nameLow : order.phoneKey;

            if (!entityMap.has(entityKey)) {
                entityMap.set(entityKey, { total: 0, returned: 0, phones: new Set() });
            }

            let entity = entityMap.get(entityKey);
            entity.total += 1;
            if (order.status === 'Returned') {
                entity.returned += 1;
            }
            entity.phones.add(order.phoneKey);
        }

        // Phase 3: Populate profileMap for ALL phones in each entity
        for (const [eKey, entity] of entityMap.entries()) {
            if (eKey === 'aminaamanapangkalan' || eKey === '99170573') console.log("Entity:", eKey, entity);
            const rt = entity.total > 0 ? Math.round((entity.returned / entity.total) * 100) : 0;
            const profileData = { total: entity.total, returned: entity.returned, rt: rt };

            for (const phone of entity.phones) {
                if (phone === '99170573') console.log("SETTING 99170573 to", profileData, "from entity", eKey);
                profileMap.set(phone, profileData);
            }
        }
    }

    console.log("553319574 Result:", profileMap.get(getMatchKey('553319574')));
    console.log("599170573 Result:", profileMap.get(getMatchKey('599170573')));
    console.log("47972 Result:", profileMap.get(getMatchKey('535737514')));
}

run();
