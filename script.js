// ============ إعدادات عامة ============
const API = "https://api.binance.com";
const trendingBox = document.getElementById("trending");
const signalsBox  = document.getElementById("signals");
const lastRun     = document.getElementById("lastRun");
const alertSound  = document.getElementById("alertSound");
const alerted     = new Set(); // لمنع تكرار التنبيه لنفس الرمز

// طلب إذن الإشعارات (المتصفح)
if ("Notification" in window && Notification.permission !== "granted") {
  Notification.requestPermission();
}

// تنقّل الأقسام
function showSection(id){
  document.querySelectorAll("section").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".bottom-bar button").forEach(b=>b.classList.remove("active"));
  document.getElementById(id==="trending-section"?"btn-trending":"btn-signals").classList.add("active");
}
showSection("trending-section");

// أدوات حساب EMA/RSI
function ema(values, period){
  const k = 2/(period+1); let out=[], prev;
  values.forEach((v,i)=>{ prev = (i===0 ? v : v*k + prev*(1-k)); out.push(prev); });
  return out;
}
function rsi(closes, period=14){
  if(closes.length<=period) return Array(closes.length).fill(null);
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){ const ch=closes[i]-closes[i-1]; if(ch>=0) gains+=ch; else losses+=-ch; }
  let avgG=gains/period, avgL=losses/period; const res=[100-(100/(1+(avgG/(avgL||1e-9))))];
  for(let i=period+1;i<closes.length;i++){
    const ch=closes[i]-closes[i-1], g=Math.max(ch,0), l=Math.max(-ch,0);
    avgG=(avgG*(period-1)+g)/period; avgL=(avgL*(period-1)+l)/period;
    res.push(100-(100/(1+(avgG/(avgL||1e-9)))));
  }
  return Array(closes.length-res.length).fill(null).concat(res);
}

// Binance public
async function get24h(){
  const r = await fetch(`${API}/api/v3/ticker/24hr`);
  if(!r.ok) throw new Error("24h fail");
  return r.json();
}
async function getKlines(symbol, interval, limit=200){
  const r = await fetch(`${API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if(!r.ok) throw new Error("klines fail");
  const data = await r.json();
  return data.map(k => parseFloat(k[4])); // closes
}

// عرض العملات الرائجة
async function loadTrending(){
  try{
    trendingBox.innerHTML = "🔄 جاري التحديث…";
    const count = parseInt(document.getElementById("scanCount").value,10);
    const all = await get24h();
    const usdt = all.filter(d => d.symbol.endsWith("USDT") && !/UPUSDT|DOWNUSDT|BULL|BEAR/i.test(d.symbol))
      .map(d => ({
        symbol:d.symbol,
        ch:parseFloat(d.priceChangePercent||"0"),
        qv:parseFloat(d.quoteVolume||"0")
      }));
    // ترتيب بالزخم (تغيّر% + جذر الحجم)
    usdt.forEach(d=> d.score = d.ch + Math.sqrt(d.qv)/10000);
    const top = usdt.sort((a,b)=>b.score-a.score).slice(0, count);

    let html = `<table>
      <thead><tr><th>الرمز</th><th>التغيّر 24h</th><th>الحجم (USDT)</th><th>الزخم</th></tr></thead><tbody>`;
    top.forEach(d=>{
      html += `<tr>
        <td>${d.symbol}</td>
        <td class="${d.ch>=0?'ok':'warn'}">${d.ch.toFixed(2)}%</td>
        <td>${d.qv.toLocaleString()}</td>
        <td>${d.score.toFixed(2)}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    trendingBox.innerHTML = html;
    lastRun.textContent = "آخر تحديث: " + new Date().toLocaleString();
  }catch(e){
    trendingBox.textContent = "❌ تعذر جلب العملات الرائجة.";
  }
}

// تحليل سريع + توليد توصيات
async function loadSignals(){
  try{
    signalsBox.innerHTML = "🔍 يفحص الأسواق…";
    const interval = document.getElementById("interval").value;
    const count = parseInt(document.getElementById("scanCount").value,10);
    const all = await get24h();
    const pool = all.filter(d => d.symbol.endsWith("USDT") && !/UPUSDT|DOWNUSDT|BULL|BEAR/i.test(d.symbol))
                    .sort((a,b)=>parseFloat(b.quoteVolume)-parseFloat(a.quoteVolume))
                    .slice(0, count);

    const analyses = await Promise.all(pool.map(async d=>{
      const closes = await getKlines(d.symbol, interval, 200);
      if (closes.length<50) return null;
      const e9 = ema(closes,9), e21 = ema(closes,21);
      const rArr = rsi(closes,14);
      const c = closes[closes.length-1];
      const crossUp = e9.at(-1) > e21.at(-1) && e9.at(-2) <= e21.at(-2);
      const r = rArr.at(-1);
      const ideal = crossUp && r>=40 && r<=65 && c>e21.at(-1);
      if(!ideal) return null;

      // أهداف سريعة
      const entry = +c.toFixed(6);
      const tp1 = +(entry*1.003).toFixed(6);
      const tp2 = +(entry*1.007).toFixed(6);
      const tp3 = +(entry*1.012).toFixed(6);
      const sl  = +(entry*0.988).toFixed(6);

      return {symbol:d.symbol, entry, tp1, tp2, tp3, sl, r:r.toFixed(1)};
    }));

    const signals = analyses.filter(Boolean);
    if(!signals.length){
      signalsBox.innerHTML = `<div>لا توجد إشارات مطابقة الآن.</div>`;
      return;
    }

    // جدول الإشارات
    let html = `<table>
      <thead><tr>
        <th>الرمز</th><th>دخول</th><th>TP1</th><th>TP2</th><th>TP3</th><th>وقف</th><th>RSI</th><th>الوقت</th>
      </tr></thead><tbody>`;
    const now = new Date().toLocaleString();
    signals.forEach(s=>{
      html += `<tr>
        <td>${s.symbol}</td>
        <td>${s.entry}</td>
        <td>${s.tp1}</td>
        <td>${s.tp2}</td>
        <td>${s.tp3}</td>
        <td>${s.sl}</td>
        <td>${s.r}</td>
        <td>${now}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    signalsBox.innerHTML = html;

    // تنبيه لأول مرة لكل رمز
    signals.forEach(s=>{
      if(!alerted.has(s.symbol)){
        alerted.add(s.symbol);
        try{ alertSound.currentTime=0; alertSound.play(); }catch{}
        if ("Notification" in window && Notification.permission==="granted"){
          new Notification(`🚀 إشارة شراء: ${s.symbol}`, {
            body:`دخول ${s.entry} | TP1 ${s.tp1} | SL ${s.sl}`,
            icon:"icon-192.png"
          });
        }
        if (window.OneSignal){
          OneSignal.push(function(){
            OneSignal.isPushNotificationsEnabled(function(enabled){
              if(enabled){
                OneSignal.sendSelfNotification(
                  `🚀 ${s.symbol}`,
                  `دخول ${s.entry} | TP1 ${s.tp1} | SL ${s.sl}`,
                  ""
                );
              }
            });
          });
        }
      }
    });
  }catch(e){
    signalsBox.textContent = "❌ تعذر إنشاء التوصيات.";
  }
}

// أزرار وأوتوماتيك
document.getElementById("refreshBtn").addEventListener("click", ()=>{ loadTrending(); loadSignals(); });
loadTrending(); loadSignals();
setInterval(()=>{ loadTrending(); loadSignals(); }, 30*60*1000);
