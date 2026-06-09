(async () => {
    try {
        const SHOP_ID = '714234971';
        const API_KEY = 'f6a4b7d3110c4dcdac0a5c04e3d81ea4';

        let found = [];
        for (let p = 1; p <= 100; p++) {
            const res = await fetch(`https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/orders?api_key=${API_KEY}&page_number=${p}&page_size=100`);
            const data = await res.json();
            const orders = Array.isArray(data) ? data : (data.data || data.orders || []);
            for (const o of orders) {
                if (['44668', '44666', '44665', '44664'].includes(String(o.id || o.order_id))) {
                    found.push({
                        id: o.id || o.order_id,
                        status: o.status_name || o.status,
                        tags: o.tags || o.order_tags || [],
                        shipped_at: o.shipped_at || o.time_send_partner
                    });
                }
            }
        }
        console.dir(found, { depth: null });
    } catch (e) {
        console.error(e);
    }
})();
