/**
 * Simple Order Risk Processor
 * Categorizes orders into READY and RISK based on KSA market rules.
 */

const orders = [
    { id: 1, phone: "0512345678", city: "Riyadh", address: "Al Olaya St, Riyadh 12211", cod: 150, return_rate: 10 },    // READY
    { id: 2, phone: "1234567890", city: "Jeddah", address: "Al Andalus", cod: 200, return_rate: 20 },               // RISK: Invalid phone
    { id: 3, phone: "9665555555", city: "", address: "Street 10, Zone 5", cod: 300, return_rate: 45 },              // RISK: Missing city
    { id: 4, phone: "0599999999", city: "Dammam", address: "Short", cod: 450, return_rate: 80 },                    // RISK: Address too short, Return rate > 65%
    { id: 5, phone: "0588888888", city: "Mecca", address: "Al Aziziyah Dist", cod: 250.5, return_rate: 5 }         // RISK: COD decimal
];

function processOrders(orders) {
    const ready = [];
    const risk = [];

    orders.forEach(order => {
        let riskReasons = [];

        // 1. Phone Check
        if (!order.phone.startsWith("05") && !order.phone.startsWith("966")) {
            riskReasons.push("Invalid phone format (must start with 05 or 966)");
        }

        // 2. COD Check
        if (order.cod <= 0) {
            riskReasons.push("COD must be greater than 0");
        } else if (!Number.isInteger(order.cod)) {
            riskReasons.push("COD must be an integer (no decimals)");
        }

        // 3. City Check
        if (!order.city || order.city.trim() === "") {
            riskReasons.push("Missing city");
        }

        // 4. Return Rate Check
        if (order.return_rate > 65) {
            riskReasons.push(`High return rate (${order.return_rate}%)`);
        }

        // 5. Address Check
        if (!order.address || order.address.length < 10) {
            riskReasons.push("Address too short/incomplete");
        }

        // Final Decision
        const processedOrder = { ...order, risk_reasons: riskReasons.join(", ") };

        if (riskReasons.length > 0) {
            risk.push(processedOrder);
        } else {
            ready.push(processedOrder);
        }
    });

    return { ready, risk };
}

// RUN PROCESS
const result = processOrders(orders);

console.log("=== READY ORDERS ===");
console.table(result.ready);

console.log("\n=== RISK ORDERS ===");
console.table(result.risk);
