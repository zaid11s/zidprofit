// ZidProfit توصيات من بيانات Binance حقيقية
// تحديث كل 30 دقيقة

const symbol = "BTCUSDT"; // غيرها للعملة اللي تريدها
const interval = "30m";   // إطار زمني (نصف ساعة)

// حساب EMA
function calculateEMA(data, period) {
    let k = 2 / (period + 1);
    let emaArray = [];
    let ema = data[0];
    emaArray.push(ema);
    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
        emaArray.push(ema);
    }
    return emaArray;
}

// حساب RSI
function calculateRSI(closes, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        let change = closes[i] - closes[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    let rs = avgGain / avgLoss;
    let rsi = 100 - 100 / (1 + rs);

    let rsiArray = [rsi];

    for (let i = period + 1; i < closes.length; i++) {
        let change = closes[i] - closes[i - 1];
        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) - change) / period;
        }
        rs = avgGain / avgLoss;
        rsi = 100 - 100 / (1 + rs);
        rsiArray.push(rsi);
    }
    return rsiArray;
}

// جلب البيانات من Binance API
async function fetchSignals() {
    try {
        let res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`);
        let data = await res.json();
        let closes = data.map(c => parseFloat(c[4])); // سعر الإغلاق

        let ema9 = calculateEMA(closes, 9);
        let ema21 = calculateEMA(closes, 21);
        let rsi = calculateRSI(closes);

        let lastEMA9 = ema9[ema9.length - 1];
        let lastEMA21 = ema21[ema21.length - 1];
        let lastRSI = rsi[rsi.length - 1];

        let signalBox = document.getElementById("signals");
        signalBox.innerHTML = "";

        if (lastEMA9 > lastEMA21 && lastRSI >= 40 && lastRSI <= 65) {
            signalBox.innerHTML = `
                ✅ توصية شراء ${symbol}<br>
                🎯 أهداف: 1% - 2% - 3%<br>
                RSI: ${lastRSI.toFixed(2)} | EMA9: ${lastEMA9.toFixed(2)} > EMA21: ${lastEMA21.toFixed(2)}<br>
                ⏰ ${new Date().toLocaleTimeString()}
            `;
            
            // إرسال إشعار
            if (window.OneSignal) {
                OneSignal.sendSelfNotification(
                    "🚀 توصية شراء",
                    `إشارة دخول على ${symbol} الآن مع أهداف 1% - 3%`,
                    "https://zaid11s.github.io/zidprofit/",
                    "https://cryptologos.cc/logos/bitcoin-btc-logo.png"
                );
            }
        } else {
            signalBox.innerHTML = "❌ لا توجد إشارة مطابقة الآن.";
        }
    } catch (err) {
        console.error("خطأ في جلب البيانات:", err);
        document.getElementById("signals").innerHTML = "⚠️ خطأ في الاتصال بـ Binance.";
    }
}

// تشغيل أول مرة
fetchSignals();

// إعادة التشغيل كل 30 دقيقة
setInterval(fetchSignals, 30 * 60 * 1000);
