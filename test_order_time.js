const profiles = [
    {
        col_0: true,
        col_1: "51947",
        col_2: "",
        col_3: "George Alvarez",
        col_4: "0571244248",
        col_5: "Villa 1 2606 Al Daw Al Lami Street",
        col_6: "",
        col_7: "KSA Kinoki x 2",
        col_8: "Đã xác nhận",
    },
    {
        col_0: false,
        col_1: "38347",
        col_2: "No longer required",
        col_3: "George Alvarez",
        col_4: "0571244248",
        col_5: "Villa 1 2606 Al Daw Al Lami Street",
        col_6: "",
        col_7: "HOUMAI CREAM",
        col_8: "Đã hoàn",
    },
    {
        col_0: false,
        col_1: "28275",
        col_2: "",
        col_3: "George Alvarez",
        col_4: "0571244248",
        col_5: "Villa 1 2606 Al Daw Al Lami Street",
        col_6: "",
        col_7: "KSA Zudaifu Crea...",
        col_8: "Đã nhận",
    },
    {
        col_0: false,
        col_1: "23320",
        col_2: "Cancel-No money",
        col_3: "George Alvarez",
        col_4: "0571244248",
        col_5: "Villa 1 2606 Al Daw Al Lami Street",
        col_6: "",
        col_7: "KSA Zudaifu Crea...",
        col_8: "Đã hoàn",
    },
    {
        col_0: false,
        col_1: "20427",
        col_2: "",
        col_3: "George Alvarez",
        col_4: "0571244248",
        col_5: "Villa 1 2606 Al Daw Al Lami Street",
        col_6: "",
        col_7: "Soofating Serum",
        col_8: "Đã nhận",
    }
];

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

let countedOrders = new Set();
let profileMap = new Map();

profiles.forEach(p => {
    let phoneStr = "";
    let statusStr = "";
    let orderIdStr = "";

    Object.values(p).forEach(val => {
        const s = (val || '').toString().trim();

        if (!s.toLowerCase().includes('date(')) {
            const mkRaw = getMatchKey(s);
            if (mkRaw && !phoneStr) phoneStr = mkRaw;
            if (s.match(/^\d{5,8}$/) && !orderIdStr) orderIdStr = s;
        }

        const sLow = s.toLowerCase();
        if (['returned', 'returning', 'đã hoàn', 'đang hoàn', 'hoàn'].some(x => sLow.includes(x))) statusStr = 'Returned';
        else if (['delivered', 'đã nhận', 'thành công'].some(x => sLow.includes(x))) statusStr = 'Delivered';
        else if (['đã gửi hàng', 'shipped', 'đang giao', 'undeliverable'].some(x => sLow.includes(x))) statusStr = 'Shipped';
        else if (['canceled', 'hủy', 'cancel', 'đã huỷ'].some(x => sLow.includes(x))) statusStr = 'Canceled';
        else if (['đã xác nhận', 'đang đóng hàng', 'chờ', 'mới'].some(x => sLow.includes(x))) statusStr = 'Pending';
    });

    const mk = getMatchKey(phoneStr);
    console.log(`Row: orderId=${orderIdStr}, mk=${mk}, status=${statusStr}`);

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
            console.log(`Added: ${uniqueKey}, total=${existing.total}, returned=${existing.returned}`);
        }
    }
});

console.log([...profileMap.entries()]);
