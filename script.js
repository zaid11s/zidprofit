// ========= إعدادات عامة =========
const API = "https://api.binance.com";
const WS  = "wss://stream.binance.com:9443/stream";
const trendingBox = document.getElementById("trending");
const signalsBox  = document.getElementById("signals");
const lastRun     = document.getElementById("lastRun") || { textContent: "" };
const alertSound  = document.getElementById("alertSound");
const scanCountEl = document.getElementById("scanCount");
const intervalEl  = document.getElementById("interval");
const refreshBtn  = document.getElementById("refreshBtn");

const MAX_CLOSES = 200;
let sockets = null;
let watchList = []; // الرموز التي نتابعها
const closesMap = new Map(); // symbol -> array of closes
const lastAlertAt = new Map(); // symbol -> timestamp (ms)
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 دقيقة

// إشعارات المتصفح
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// تنقّل الأقسام (موجود مسبقًا بالـ CSS)
window.showSection = function(id){
  document.querySelectorAll("section").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".bottom-bar button").forEach(b=>b.classList.remove("active"));
  document.getElementById(id==="trending-section"?"btn-trending":"btn-signals").classList.add("active");
};

// أدوات المؤشرات
function ema(values, period){
  const k = 2/(period+1); let prev, out=[];
  values.forEach((v,i)=>{ prev = (i===0? v : v*k + prev*(1-k)); out.push(prev);});
  return out;
}
function rsi(closes, period=14){
  if (closes.length <= period) return Array(closes.length).fill(null);
  let gains=0,losses=0;
  for (let i=1;i<=period;i++){
    const ch = closes[i]-closes[i-1];
    if (ch>=0) gains+=ch; else losses+=-ch;
  }
  let avgG=gains/period, avgL=losses/period;
  const out=[100-(100/(1+(avgG/(avgL||1e-9))))];
  for (let i=period+1;i<closes.length;i++){
    const ch = closes[i]-closes[i-1];
    const g = Math.max(ch,0), l=Math.max(-ch,0);
    avgG=(avgG*(period-1)+g)/period;
    avgL=(avgL*(period-1)+l)/period;
    out.push(100-(100/(1+(avgG/(avgL||1e-9)))));}
  return Array(closes.length-out.length).fill(null).concat(out);
}

// عرض الجدول البسيط
function renderTrending(rows){
  let html = `<table>
    <thead><tr><th>الرمز</th><th>التغيّر 24h</th><th>الحجم (USDT)</th></tr></thead><tbody>`;
  rows.forEach(r=>{
    html += `<tr>
      <td>${r.symbol}</td>
      <td class="${r.chg>=0?'ok':'warn'}">${r.chg.toFixed(2)}%</td>
      <td>${Number(r.qv).toLocaleString()}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  trendingBox.innerHTML = html;
}

// إشعارات
function notify(symbol, entry, tp1, sl){
  // صوت
  try { alertSound.currentTime = 0; alertSound.play(); } catch {}
  // متصفح
  if ("Notification" in window && Notification.permission==="granted"){
    new Notification(`🚀 إشارة شراء: ${symbol}`, {
      body: `دخول ${entry} | TP1 ${tp1} | SL ${sl}`,
      icon: "icon-192.png"
    });
  }
  // OneSignal (محلي)
  if (window.OneSignal){
    OneSignal.push(function(){
      OneSignal.isPushNotificationsEnabled(function(enabled){
        if (enabled){
          OneSignal.sendSelfNotification(`🚀 ${symbol}`,
            `دخول ${entry} | TP1 ${tp1} | SL ${sl}`, "");
        }
      });
    });
  }
}

// فحص الإشارة
function evaluateSignal(symbol){
  const closes = closesMap.get(symbol);
  if (!closes || closes.length < 50) return null;

  const e9  = ema(closes, 9);
  const e21 = ema(closes, 21);
  const rArr= rsi(closes, 14);

  const c     = closes.at(-1);
  const prev9 = e9.at(-2), now9 = e9.at(-1);
  const prev21= e21.at(-2),now21= e21.at(-1);
  const crossUp = now9 > now21 && prev9 <= prev21;
  const r = rArr.at(-1);

  const ideal = crossUp && r>=40 && r<=65 && c>now21;
  if (!ideal) return null;

  // أهداف سريعة (نِسَب صغيرة للمدى القصير)
  const entry = +c.toFixed(6);
  const tp1   = +(entry*1.003).toFixed(6);
  const tp2   = +(entry*1.007).toFixed(6);
  const tp3   = +(entry*1.012).toFixed(6);
  const sl    = +(entry*0.988).toFixed(6);

  return { symbol, entry, tp1, tp2, tp3, sl, r: r.toFixed(1) };
}

// تحديث واجهة التوصيات
function renderSignalRow(sig){
  const now = new Date().toLocaleString();
  const row = `<tr>
    <td>${sig.symbol}</td>
    <td>${sig.entry}</td>
    <td>${sig.tp1}</td>
    <td>${sig.tp2}</td>
    <td>${sig.tp3}</td>
    <td>${sig.sl}</td>
    <td>${sig.r}</td>
    <td>${now}</td>
  </tr>`;
  if (!document.getElementById("signals-table")) {
    signalsBox.innerHTML = `<table id="signals-table">
      <thead><tr>
        <th>الرمز</th><th>دخول</th><th>TP1</th><th>TP2</th><th>TP3</th><th>وقف</th><th>RSI</th><th>الوقت</th>
      </tr></thead><tbody></tbody></table>`;
  }
  document.querySelector("#signals-table tbody").insertAdjacentHTML("afterbegin", row);
}

// تحميل قائمة الرائجة وفتح WebSocket
async function initStreams(){
  // إغلاق أي سواكِت سابقة
  if (sockets && sockets.readyState === WebSocket.OPEN) {
    try { sockets.close(); } catch {}
  }
  closesMap.clear();
  watchList = [];

  try{
    trendingBox.textContent = "🔄 يجلب العملات الرائجة…";
    const count = parseInt((scanCountEl && scanCountEl.value) || "60", 10);
    const interval = (intervalEl && intervalEl.value) || "15m";

    // 1) جلب 24h واختيار أفضل USDT حسب الحجم
    const r = await fetch(`${API}/api/v3/ticker/24hr`);
    const all = await r.json();
    const rows = all
      .filter(d => d.symbol.endsWith("USDT") && !/UPUSDT|DOWNUSDT|BULL|BEAR/i.test(d.symbol))
      .map(d => ({ symbol:d.symbol, chg: +d.priceChangePercent, qv:+d.quoteVolume }))
      .sort((a,b)=> b.qv - a.qv)
      .slice(0, count);

    renderTrending(rows);
    lastRun.textContent = "آخر تحديث: " + new Date().toLocaleString();

    // 2) تحميل آخر 200 إغلاق مبدئيًا لكل رمز
    await Promise.all(rows.map(async row=>{
      const kr = await fetch(`${API}/api/v3/klines?symbol=${row.symbol}&interval=${interval}&limit=${MAX_CLOSES}`);
      const kd = await kr.json();
      const closes = kd.map(k=> +k[4]);
      closesMap.set(row.symbol, closes.slice(-MAX_CLOSES));
      watchList.push(row.symbol);
    }));

    // 3) فتح WebSocket مجمّع
    const streams = watchList
      .map(s => `${s.toLowerCase()}@kline_${interval}`)
      .join("/");
    sockets = new WebSocket(`${WS}?streams=${streams}`);

    sockets.onopen = ()=> {
      console.log("WS opened");
      signalsBox.innerHTML = "⏳ جارِ متابعة الإشارات...";
    };

    sockets.onmessage = (evt)=>{
      const msg = JSON.parse(evt.data);
      if (!msg || !msg.data || !msg.data.k) return;
      const k = msg.data.k; // كاين الشمعة
      if (!k.x) return;     // نأخذ فقط إغلاق الشمعة
      const symbol = k.s;
      const close = +k.c;

      const arr = closesMap.get(symbol) || [];
      arr.push(close);
      if (arr.length > MAX_CLOSES) arr.shift();
      closesMap.set(symbol, arr);

      const sig = evaluateSignal(symbol);
      if (sig){
        // منع التكرار خلال 30 دقيقة
        const last = lastAlertAt.get(symbol) || 0;
        if (Date.now() - last > ALERT_COOLDOWN_MS){
          lastAlertAt.set(symbol, Date.now());
          renderSignalRow(sig);
          notify(sig.symbol, sig.entry, sig.tp1, sig.sl);
        }
      }
    };

    sockets.onerror = ()=> console.warn("WS error");
    sockets.onclose  = ()=> console.log("WS closed");

  }catch(e){
    console.error(e);
    trendingBox.textContent = "❌ تعذر الاتصال ببيانات Binance.";
    signalsBox.textContent  = "❌ تعذر تشغيل الإشارات.";
  }
}

// أزرار
if (refreshBtn) refreshBtn.addEventListener("click", initStreams);
initStreams();                         // أول تشغيل
setInterval(initStreams, 30*60*1000);  // إعادة تهيئة كل 30 دقيقة (لتحديث الرائجة/الحجم)
