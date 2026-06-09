const fetch = require('node-fetch');
(async () => {
    try {
        const SHOP_ID = '714234971';
        const API_KEY = 'f6a4b7d3110c4dcdac0a5c04e3d81ea4';
        let foundRefused = [];
        for (let p = 1; p <= 10; p++) {
            const res = await fetch(`https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/orders?api_key=${API_KEY}&page_number=${p}&page_size=100`);
            const data = await res.json();
            const orders = Array.isArray(data) ? data : (data.data || data.orders || []);
            for (const o of orders) {
                const tagsRaw = o.tags || o.order_tags || [];
                const tagsStr = JSON.stringify(tagsRaw).toLowerCase();
                if (tagsStr.includes('refuse')) {
                    foundRefused.push({
                        id: o.id || o.order_id,
                        status: o.status_name || o.status,
                        tags: tagsRaw,
                        shipped_at: o.shipped_at || o.time_send_partner
                    });
                }
            }
        }
        console.log('Found ' + foundRefused.length + ' refused orders in first 1000 orders.');
        if (foundRefused.length > 0) console.log(foundRefused.slice(0, 3));
    } catch (e) {
        console.error('Fetch failed:', e);
    }
})();
