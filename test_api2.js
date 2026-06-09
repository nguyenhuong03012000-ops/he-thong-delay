(async () => {
    try {
        const SHOP_ID = '714234971';
        const API_KEY = 'f6a4b7d3110c4dcdac0a5c04e3d81ea4';
        let foundRefused = [];

        const fetchPage = async (p) => {
            const res = await fetch(`https://pos.pancake.vn/api/v1/shops/${SHOP_ID}/orders?api_key=${API_KEY}&page_number=${p}&page_size=100`);
            const data = await res.json();
            return Array.isArray(data) ? data : (data.data || data.orders || []);
        };

        let promises = [];
        for (let p = 1; p <= 150; p++) promises.push(fetchPage(p));

        console.log('Fetching 15,000 orders...');
        const pages = await Promise.all(promises);

        for (const orders of pages) {
            for (const o of orders) {
                const tagsRaw = o.tags || o.order_tags || [];
                const tagsStr = JSON.stringify(tagsRaw).toLowerCase();
                if (tagsStr.includes('refuse')) {
                    foundRefused.push({
                        id: o.id || o.order_id,
                        status: o.status_name || o.status,
                        tags: tagsRaw,
                        shipped_at: o.shipped_at || o.time_send_partner,
                        created: o.inserted_at
                    });
                }
            }
        }

        console.log('Found ' + foundRefused.length + ' refused orders in first 15000 orders.');

        // Group by status
        let stats = {};
        for (const r of foundRefused) {
            stats[r.status] = (stats[r.status] || 0) + 1;
        }
        console.log('Status distribution:', stats);

        if (foundRefused.length > 0) console.dir(foundRefused.slice(0, 5), { depth: null });
    } catch (e) {
        console.error('Fetch failed:', e);
    }
})();
