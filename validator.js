/**
 * KSA Order Risk Validator (V5.0 - Minimal) 🇸🇦🚀
 * Rules:
 * - Phone must start with 05 or 966
 * - COD must be > 0 and NOT a decimal
 * - City must be provided
 * - Return rate must be <= 65%
 * - Address must be >= 15 characters
 */

function processOrders(orders) {
    const ready = [];
    const risk = [];

    orders.forEach(order => {
        const reasons = [];

        // 1. Phone Rule: start with 05 or 966
        const phoneStr = (order.phone || '').toString();
        if (!phoneStr.startsWith('05') && !phoneStr.startsWith('966')) {
            reasons.push('Invalid phone format (must be 05 or 966)');
        }

        // 2. COD Rule: <= 0 or decimal
        const cod = order.cod;
        if (cod <= 0 || !Number.isInteger(cod)) {
            reasons.push('Invalid COD (must be > 0 and not a decimal)');
        }

        // 3. City Rule: Missing city
        if (!order.city || order.city.trim() === '') {
            reasons.push('Missing city');
        }

        // 4. Return Rate Rule: > 65%
        if (order.return_rate > 65) {
            reasons.push(`High return rate (${order.return_rate}%)`);
        }

        // 5. Address Rule: Too short (< 15 chars)
        if (!order.address || order.address.trim().length < 15) {
            reasons.push('Address too short');
        }

        const processedOrder = {
            ...order,
            risk_reason: reasons.join('. ')
        };

        if (reasons.length === 0) {
            ready.push(processedOrder);
        } else {
            risk.push(processedOrder);
        }
    });

    return { ready, risk };
}

// --- 5 SAMPLE ORDERS FOR TESTING ---
const samples = [
    { phone: '0507390419', city: 'Jeddah', address: 'Al-Nahda Dist, Street 15, Near Mall', cod: 150, return_rate: 20 },      // READY
    { phone: '1234567890', city: 'Riyadh', address: 'King Fahd Road, Gate 4', cod: 99, return_rate: 5 },                // RISK (Phone)
    { phone: '966573284801', city: 'Dammam', address: 'Main Street', cod: 89.5, return_rate: 10 },                       // RISK (COD decimal + Address short)
    { phone: '0566893461', city: '', address: 'Neighborhood 7, House 12, King Street', cod: 0, return_rate: 80 },        // RISK (City + COD 0 + Return Rate)
    { phone: '0509765833', city: 'Mecca', address: 'Near Big Landmark', cod: 250, return_rate: 15 }                       // RISK (Address short)
];

const result = processOrders(samples);

console.log('--- READY ORDERS ---');
console.log(JSON.stringify(result.ready, null, 2));

console.log('\n--- RISK ORDERS ---');
console.log(JSON.stringify(result.risk, null, 2));

// Export for use elsewhere (Node.js/Module)
if (typeof module !== 'undefined') module.exports = { processOrders, samples };
