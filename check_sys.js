const fs = require('fs');
fetch('https://pos.pancake.vn/api/v1/shops/714234971/orders?api_key=f6a4b7d3110c4dcdac0a5c04e3d81ea4&page_number=1&page_size=1')
    .then(r => r.json())
    .then(d => {
        const ord = d.data ? d.data[0] : d[0];
        console.log(Object.keys(ord).filter(k => k.includes('note')));

        console.log('--- Note fields:');
        console.log('seller_note:', ord.seller_note);
        console.log('note:', ord.note);
        console.log('customer_note:', ord.customer_note);
        console.log('shipping_note:', ord.shipping_note);
        console.log('note_print:', ord.note_print);

        fs.writeFileSync('sample_ord.json', JSON.stringify(ord, null, 2));
    });
