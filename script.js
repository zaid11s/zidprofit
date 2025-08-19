// 🔑 مفاتيح API (اختبار فقط)
const API_KEY = "pDBZFSNgno9tmjgrFkjlBdYJucCcN UeaBYKJ2a5xelJjQhSV4tstZuC1iyBiMDxP";
const API_SECRET = "og8YL44Mihjb8aKVyCmPgXlf2wPl TcX714W505DHtH6527CYdodedSH9caFfbuJc";

// تحميل العملات الرائجة من CoinGecko
async function loadTrendingCoins() {
  try {
    let res = await fetch("https://api.coingecko.com/api/v3/search/trending");
    let data = await res.json();
    let html = "";
    data.coins.forEach(c => {
      html += `<div class="card">🔥 ${c.item.name} (${c.item.symbol.toUpperCase()})</div>`;
    });
    document.getElementById("trending").innerHTML = html;
  } catch (err) {
    console.error("خطأ في جلب العملات:", err);
  }
}

// توليد توصيات عشوائية (بدون تحليل حقيقي)
function makeSignal() {
  const coins = ["BTC", "ETH", "BNB", "SOL", "ADA", "XRP"];
  const coin = coins[Math.floor(Math.random() * coins.length)];
  const now = new Date().toLocaleTimeString();

  const signal = `
    <div class="card">
      📈 توصية شراء: <b>${coin}</b><br/>
      🎯 هدف 1: +2% | 🎯 هدف 2: +5% | 🎯 هدف 3: +8% <br/>
      ⏰ ${now}
    </div>
  `;

  document.getElementById("signals").innerHTML =
    signal + document.getElementById("signals").innerHTML;

  // إرسال إشعار عبر OneSignal
  if (window.OneSignal) {
    OneSignal.push(() => {
      OneSignal.showNativePrompt();
    });
  }
}

// تحميل العملات الرائجة عند فتح الصفحة
loadTrendingCoins();

// توليد توصية جديدة كل 30 دقيقة (اختصارًا: هنا كل دقيقة للتجربة)
setInterval(makeSignal, 60000);
