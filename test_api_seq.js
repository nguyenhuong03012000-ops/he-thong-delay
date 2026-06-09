const fetch = require('node-fetch');
(async () => {
    try {
        const SHOP_ID = '714234971';
        const API_KEY = 'f6a4b7d3110c4dcdac0a5c04e3d81ea4';
        let foundRefused = [];
        let totalOrders = 0;

        console.log('Starting sequential fetch to avoid rate limits...');
        for (let p = 1; p <= 345; p++) {
            const res = await fetch(`https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/orders?api_key=${API_KEY}&page_number=${p}&page_size=100`);
            const data = await res.json();
            const orders = Array.isArray(data) ? data : (data.data || data.orders || []);
            if (!orders || orders.length === 0) {
                console.log('No orders at page ' + p + ', breaking.');
                break;
            }
            totalOrders += orders.length;
            for (const o of orders) {
                const tagsRaw = o.tags || o.order_tags || [];
                const tagsStr = JSON.stringify(tagsRaw).toLowerCase();
                if (tagsStr.includes('refuse')) {
                    foundRefused.push(o.id || o.order_id);
                }
            }
            if (p % 50 === 0) console.log('Fetched ' + p + ' pages. Refused so far: ' + foundRefused.length);
        }

        console.log('Finished. Total orders: ' + totalOrders);
        console.log('TOTAL REFUSED ORDER TAGS FOUND IN NATIVE API: ' + foundRefused.length);
    } catch (e) {
        console.error('Fetch failed:', e);
    }
})();
