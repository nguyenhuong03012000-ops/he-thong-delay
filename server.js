const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const OpenAI = require('openai');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const cron = require('node-cron');
const axios = require('axios');
const RawOrder = require('./src/models/RawOrder');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// -------- BẢO MẬT & ĐƯỜNG DẪN WEB (DASHBOARD) --------
const basicAuth = (req, res, next) => {
    // Bỏ qua tài khoản cho các đường dẫn API ngầm
    if (req.path.startsWith('/api/')) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Secure Dashboard"');
        return res.status(401).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:50px;">🔴 TRUY CẬP BỊ TỪ CHỐI. YÊU CẦU MẬT KHẨU!</h2>');
    }

    const [login, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');

    // Tên đăng nhập và Mật khẩu chung cho Team
    if (login === 'zen8' && password === 'baocao2026') {
        return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Dashboard"');
    return res.status(401).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:50px;">🔴 SAI MẬT KHẨU HOẶC TÀI KHOẢN!</h2>');
};

app.use(basicAuth);

// Chỉ cho phép truy cập các file Web (Chống lộ file .env hay mã nguồn bảo mật)
const allowedFiles = [
    'index_v2.html', 'Bao_Cao_Delay_Doc_Lap.html', 'index_kw.html', 'dashboard.html', 'index.html',
    'app_v2.js', 'app_kw.js', 'delay_v27.js', 'app.js', 'bundle.js', 'patch_v25.js'
];

app.get('/*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next(); // Bỏ qua nếu là API endpoint

    // Nếu vào trang chủ / thì tự động mở báo cáo index_v2.html
    let requestedFile = req.path === '/' ? 'index_v2.html' : req.path.substring(1);

    if (allowedFiles.includes(requestedFile)) {
        return res.sendFile(path.join(__dirname, requestedFile));
    }

    next();
});

const PORT = 3000;

// Config: Using the user's validated 2026 Saudi Arabia Sheet ID
const SHEET_ID = '1s_kiZmo0K4-xVoceA31Bk3YtZ_HiSygjM1D2EF6bjMc';

// -------- MONGODB UPSET & CRON JOB CONFIG --------
const PANCAKE_API_KEY = "f6a4b7d3110c4dcdac0a5c04e3d81ea4";
const PANCAKE_SHOP_ID = "714234971";

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(async () => {
            console.log('✅ MongoDB Connected');
            // Auto-wipe the collection on booting to clear the previously locked 512MB bloated payload.
            // Once this runs, the newly mapped lightweight payloads will be populated by the CRON.
            try {
                await RawOrder.collection.drop();
                console.log('✅ Auto-cleared MongoDB collection on boot to restore quota.');
            } catch (e) {
                console.log('ℹ️ Auto-clear skipped or collection already empty:', e.message);
            }
        })
        .catch(err => console.log('❌ MongoDB Connection Error:', err));
} else {
    console.warn('⚠️ MONGODB_URI missing in .env! Database and Cron caching will be disabled.');
}

// Scheduled Cron Job: Fetch Data from Pancake API every 5 minutes
cron.schedule('*/5 * * * *', async () => {
    if (!process.env.MONGODB_URI) return;
    console.log(`[CRON] ${new Date().toISOString()} Starting background fetch from Pancake API...`);
    try {
        const initUrl = `https://pos.pancake.vn/api/v1/shops/${PANCAKE_SHOP_ID}/orders?api_key=${PANCAKE_API_KEY}&page_number=1&page_size=100`;
        const data1Req = await axios.get(initUrl, { timeout: 20000 }).catch(e => null);

        if (!data1Req || !data1Req.data) {
            console.log('[CRON] Failed to fetch page 1');
            return;
        }

        const data1 = data1Req.data;
        const totalPages = data1.total_pages || 1;
        let raw1 = Array.isArray(data1) ? data1 : (data1.data || data1.orders || []);

        const trimRaw = (r) => {
            if (!r) return null;
            return {
                id: r.id,
                order_id: r.order_id,
                status: r.status,
                status_name: r.status_name,
                inserted_at: r.inserted_at,
                created_at: r.created_at,
                updated_at: r.updated_at,
                latest_status_time: r.latest_status_time,
                city: r.city,
                customer_name: r.customer_name,
                phone: r.phone,
                bill_full_name: r.bill_full_name,
                bill_phone_number: r.bill_phone_number,
                carrier: r.carrier,
                carrier_name: r.carrier_name,
                partner_name: r.partner_name,
                market: r.market,
                tags: r.tags,
                order_tags: r.order_tags,
                note: r.note,
                seller_note: r.seller_note,
                shipping_note: r.shipping_note,
                customer_note: r.customer_note,
                partner_note: r.partner_note,
                tracking_number: r.tracking_number,
                tracking_link: r.tracking_link,
                shop_id: r.shop_id,
                page_id: r.page_id,
                // Partial specific objects
                shipping_address: r.shipping_address ? {
                    province: r.shipping_address.province,
                    province_name: r.shipping_address.province_name,
                    city_name: r.shipping_address.city_name,
                    full_address: r.shipping_address.full_address
                } : null,
                partner: r.partner ? {
                    extend_code: r.partner.extend_code,
                    partner_name: r.partner.partner_name,
                    name: r.partner.name
                } : null,
                customer: r.customer ? {
                    name: r.customer.name,
                    phone_number: r.customer.phone_number,
                    id: r.customer.id,
                    conversation_link: r.customer.conversation_link
                } : null,
                page: r.page ? { id: r.page.id } : null,
                recent_history: r.recent_history // used by extractPackingTime wrapper
            };
        };

        const upsertBatch = async (rawBatch, pageNum) => {
            const bulkOps = rawBatch.filter(raw => raw && (raw.id || raw.order_id)).map(raw => ({
                updateOne: {
                    filter: { id: String(raw.id || raw.order_id) },
                    update: { $set: { id: String(raw.id || raw.order_id), data: trimRaw(raw), fetched_at: new Date() } },
                    upsert: true
                }
            }));
            if (bulkOps.length > 0) {
                await RawOrder.bulkWrite(bulkOps, { ordered: false }).catch(e => console.log(`[CRON] bulkWrite error on page ${pageNum}:`, e.message));
            }
        };

        if (raw1.length > 0) await upsertBatch(raw1, 1);

        // Fetch remaining pages concurrently with limit (similar to frontend but safely in backend)
        const concurrencyLimit = 5;
        let activeCount = 0;
        let currentIndex = 2;

        await new Promise(resolveQueue => {
            function runNext() {
                if (currentIndex > totalPages && activeCount === 0) {
                    resolveQueue();
                    return;
                }
                while (activeCount < concurrencyLimit && currentIndex <= totalPages) {
                    const p = currentIndex++;
                    activeCount++;
                    const u = `https://pos.pancake.vn/api/v1/shops/${PANCAKE_SHOP_ID}/orders?api_key=${PANCAKE_API_KEY}&page_number=${p}&page_size=100`;
                    axios.get(u, { timeout: 20000 })
                        .then(async (req) => {
                            if (req && req.data) {
                                let raw = Array.isArray(req.data) ? req.data : (req.data.data || req.data.orders || []);
                                if (raw.length > 0) await upsertBatch(raw, p);
                            }
                        })
                        .catch(err => console.log(`[CRON] Error on page ${p}:`, err.message))
                        .finally(() => {
                            activeCount--;
                            runNext();
                        });
                }
            }
            runNext();
        });

        console.log(`[CRON] Successfully fetched and upserted up to ${totalPages} pages array to MongoDB.`);
    } catch (e) {
        console.error('[CRON] Error:', e.message);
    }
});

/**
 * CACHED REPORTING ENDPOINT 📈
 */
app.get('/api/delay-orders', async (req, res) => {
    try {
        if (!process.env.MONGODB_URI) {
            return res.status(503).json({ success: false, error: 'Database caching is disabled.' });
        }

        const orders = await RawOrder.find({}, { data: 1, _id: 0 }).limit(45000).lean();
        const rawArray = orders.map(o => o.data).filter(Boolean);

        return res.json({ success: true, count: rawArray.length, data: rawArray });
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.end();
        }
    }
});

/**
 * CLEAR DATABASE ENDPOINT (Manual trigger to wipe the 512MB bloated payload if quota is exceeded)
 */
app.get('/api/clear-db', basicAuth, async (req, res) => {
    try {
        if (!process.env.MONGODB_URI) return res.send('Mongodb not configured');
        await RawOrder.collection.drop();
        res.send('✅ ĐÃ DỌN SẠCH KÉT SẮT 512MB CỦA ĐÁM MÂY. BẠN HÃY CHỜ 3 PHÚT ĐỂ BOT BẮT ĐẦU KÉO LẠI DỮ LIỆU SUPER NHẸ NHÉ!');
    } catch (e) {
        if (e.code === 26 || e.message.includes('ns not found')) {
            res.send('✅ ĐÃ DỌN SẠCH KÉT SẮT 512MB CỦA ĐÁM MÂY. BẠN HÃY CHỜ 3 PHÚT ĐỂ BOT BẮT ĐẦU KÉO LẠI DỮ LIỆU SUPER NHẸ NHÉ!');
        } else {
            res.send(`Failed to clear: ${e.message}`);
        }
    }
});

/**
 * PRO AI BATCH PROCESSOR (V6.0) 🛡️🇸🇦🚀
 */
app.post('/api/process-batch', async (req, res) => {
    try {
        const { sheetUrl } = req.body;
        const targetId = extractSheetId(sheetUrl) || SHEET_ID;

        // 1. Google Auth (Requires .env credentials)
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
            throw new Error('Google Service Account credentials missing in .env');
        }

        const serviceAccountAuth = new JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(targetId, serviceAccountAuth);
        await doc.loadInfo();

        // 2. Load Tabs (STRICT NAMES)
        const orderSheet = doc.sheetsByTitle['JNT KSA'];
        const hleSheet = doc.sheetsByTitle['JNT KSA-HLE'];
        const profileSheet = doc.sheetsByTitle['PosSheets(SỐ ĐƠN MUA)'];

        if (!profileSheet) {
            throw new Error('Required tab "PosSheets(SỐ ĐƠN MUA)" not found.');
        }

        const orderRows1 = orderSheet ? await orderSheet.getRows() : [];
        const orderRows2 = hleSheet ? await hleSheet.getRows() : [];
        const orderRows = [...orderRows1, ...orderRows2];
        const profileRows = await profileSheet.getRows();

        // 3. AI Setup (Optional)
        const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

        // 4. Index Profiles
        const profileMap = new Map();
        profileRows.forEach(row => {
            const mk = getMatchKey(row.get('Số điện thoại') || row.get('phone') || '');
            if (mk) {
                profileMap.set(mk, {
                    total: parseInt(row.get('Số đơn của khách') || '0'),
                    rate: parseFloat((row.get('Tỷ lệ hoàn') || '0').toString().replace('%', '')) || 0
                });
            }
        });

        const readyRows = [];
        const riskRows = [];

        // 5. Decision Engine (V6.0)
        for (const row of orderRows) {
            const data = {
                order_id: row.get('Mã tùy chỉnh') || 'N/A',
                customer: row.get('Khách hàng') || 'N/A',
                phone: row.get('Số điện thoại') || '',
                city: row.get('Tỉnh/Thành phố') || '',
                address: row.get('Địa chỉ') || '',
                cod: parseFloat((row.get('COD') || '0').toString().replace(',', '.')) || 0,
                note: row.get('Ghi chú nội bộ') || ''
            };

            const mk = getMatchKey(data.phone);
            const profile = profileMap.get(mk) || { total: 0, rate: 0 };

            // Customer Tier
            let custTier = 'GOOD';
            if (profile.returned >= 2 || (profile.total >= 3 && profile.rate > 65)) custTier = 'BAD';
            else if (profile.rate >= 30) custTier = 'MEDIUM';

            const analysis = {
                risk_reasons: [],
                risk_level: 'LOW',
                suggested_city: '',
                confidence: 0,
                ai_address_score: 100
            };

            // Rule 1: Phone
            if (!data.phone.startsWith('05') && !data.phone.startsWith('966')) {
                analysis.risk_reasons.push('Invalid phone (must start with 05 or 966)');
                analysis.risk_level = 'HIGH';
            }

            // Rule 2: COD
            if (data.cod <= 0 || !Number.isInteger(data.cod)) {
                analysis.risk_reasons.push('Invalid COD (non-positive or decimal)');
            }

            // Rule 3: City (AI Extraction)
            if (!data.city && openai) {
                const aiCity = await aiSuggestCity(openai, data.address);
                analysis.suggested_city = aiCity.suggested_city;
                analysis.confidence = aiCity.confidence;
                analysis.risk_reasons.push('Missing city');
                analysis.risk_level = 'HIGH';
            } else if (!data.city) {
                analysis.risk_reasons.push('Missing city');
                analysis.risk_level = 'HIGH';
            }

            // Rule 4: Address (AI Evaluation)
            let addrRisk = false;
            if (openai && data.address) {
                const aiAddr = await aiEvaluateAddress(openai, data.address);
                analysis.ai_address_score = aiAddr.score;
                if (aiAddr.label === 'RISK') {
                    addrRisk = true;
                    analysis.risk_reasons.push(`AI Address Warning: ${aiAddr.reason}`);
                }
            } else if (data.address.length < 15) {
                addrRisk = true;
                analysis.risk_reasons.push('Address too short');
            }

            // Rule 5: Final Decision logic
            if (custTier === 'BAD') analysis.risk_level = 'HIGH';
            if (addrRisk) analysis.risk_level = 'MEDIUM';

            let decision = 'READY';
            if (analysis.risk_level === 'HIGH' || custTier === 'BAD') decision = 'RISK';
            if (addrRisk && custTier === 'MEDIUM') decision = 'RISK';
            if (addrRisk && custTier === 'GOOD') decision = 'READY'; // Override!
            if (data.cod <= 0 || !data.city || !data.phone) decision = 'RISK';

            const outputRow = {
                ...data,
                total_orders: profile.total,
                return_rate: profile.rate + '%',
                risk_reason: analysis.risk_reasons.join('. '),
                risk_level: analysis.risk_level,
                suggested_city: analysis.suggested_city,
                confidence: analysis.confidence,
                ai_address_score: analysis.ai_address_score
            };

            if (decision === 'READY') readyRows.push(outputRow);
            else riskRows.push(outputRow);
        }

        // 6. Output to New Sheets
        await writeResults(doc, 'READY', readyRows);
        await writeResults(doc, 'RISK', riskRows);

        res.json({ success: true, readyCount: readyRows.length, riskCount: riskRows.length });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

function getMatchKey(p) {
    if (!p) return '';
    let clean = p.toString().replace(/[^0-9]/g, '');
    if (clean.startsWith('09665')) clean = clean.substring(4);
    else if (clean.startsWith('9665')) clean = clean.substring(3);
    else if (clean.startsWith('05')) clean = clean.substring(1);
    return (clean.length === 9 && clean.startsWith('5')) ? clean : '';
}

async function aiSuggestCity(openai, address) {
    const prompt = `Extract the most likely city in Saudi Arabia from this address: "${address}". Only choose from: Riyadh, Jeddah, Mecca, Medina, Dammam, Taif, Tabuk, Abha. Return JSON: {"suggested_city": "city name", "confidence": number}`;
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
}

async function aiEvaluateAddress(openai, address) {
    const prompt = `Evaluate this shipping address in Saudi Arabia: "${address}". Return JSON: {"score": number, "label": "SAFE" or "RISK", "reason": "text"}`;
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
}

async function writeResults(doc, title, data) {
    let sheet = doc.sheetsByTitle[title];
    if (sheet) await sheet.clear();
    else sheet = await doc.addSheet({ title, headerValues: Object.keys(data[0] || {}) });
    if (data.length > 0) await sheet.addRows(data);
}

function extractSheetId(url) {
    const matches = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return (matches && matches[1]) ? matches[1] : null;
}

app.listen(PORT, () => console.log(`V6.0 Server running on http://localhost:${PORT}`));
