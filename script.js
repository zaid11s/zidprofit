// عرض القسم المطلوب
function showSection(id) {
  document.querySelectorAll("section").forEach(sec => sec.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  // تفعيل الزر النشط
  document.querySelectorAll(".bottom-bar button").forEach(btn => btn.classList.remove("active"));
  if (id === "trending-section") {
    document.getElementById("btn-trending").classList.add("active");
  } else {
    document.getElementById("btn-signals").classList.add("active");
  }
}

// تحميل العملات الرائجة (محاكاة)
function loadTrending() {
  const trending = document.getElementById("trending");
  trending.innerHTML = "<p>🔄 تحديث البيانات...</p>";

  setTimeout(() => {
    trending.innerHTML = `
      <table>
        <tr><th>العملة</th><th>التغيير %</th><th>الحجم</th></tr>
        <tr><td>BTCUSDT</td><td style="color:lime">+2.5%</td><td>1.2B</td></tr>
        <tr><td>ETHUSDT</td><td style="color:lime">+3.1%</td><td>850M</td></tr>
      </table>
    `;
  }, 1000);
}

// تحميل التوصيات (محاكاة)
function loadSignals() {
  const signals = document.getElementById("signals");
  signals.innerHTML = "<p>🔄 تحديث التوصيات...</p>";

  setTimeout(() => {
    signals.innerHTML = `
      <table>
        <tr>
          <th>الرمز</th><th>دخول</th><th>TP1</th><th>TP2</th><th>TP3</th><th>وقف</th>
        </tr>
        <tr>
          <td>BTCUSDT</td><td>26000</td><td>26200</td><td>26500</td><td>27000</td><td>25500</td>
        </tr>
        <tr>
          <td>ETHUSDT</td><td>1800</td><td>1820</td><td>1850</td><td>1900</td><td>1750</td>
        </tr>
      </table>
    `;
  }, 1200);
}

// أول تشغيل
showSection("trending-section");
loadTrending();
loadSignals();// ====== إعدادات عامة ======
const API = "https://api.binance.com";
const DEFAULT_INTERVAL = "30m";   // تحديث كل 30 دقيقة
const SCAN_COUNT = 20;            // نفحص أعلى 20 عملة رائجة

const note = document.getElementById("note");
const lastRun = document.getElementById("lastRun");
const tblTrending = document.querySelector("#tblTrending tbody");
const tblSignals  = document.querySelector("#tblSignals tbody");

// إشعار داخل المتصفح (عند فتح الموقع)
async function notify(text){
  try{
    if(Notification && Notification.permission !== "granted"){
      await Notification.requestPermission();
    }
    if(Notification && Notification.permission === "granted"){
      new Notification("ZidProfit", { body: text });
    }
  }catch{}
}

// حساب EMA
function ema(values, period){
  const k = 2/(period+1);
  let emaArr = [];
  let prev;
  values.forEach((v,i)=>{
    if(i===0){ prev = v; emaArr.push(v); }
    else{ prev = v*k + prev*(1-k); emaArr.push(prev); }
  });
  return emaArr;
}

// حساب RSI(14)
function rsi(closes, period=14){
  let gains=0, losses=0;
  for(let i=1;i<=period;i++){
    const ch = closes[i]-closes[i-1];
    if(ch>=0) gains += ch; else losses += -ch;
  }
  let avgGain = gains/period;
  let avgLoss = losses/period;
  let rs = avgLoss===0 ? 100 : avgGain/avgLoss;
  let rsiArr = [100 - (100/(1+rs))];
  for(let i=period+1;i<closes.length;i++){
    const ch = closes[i]-closes[i-1];
    const g = ch>0?ch:0, l = ch<0?-ch:0;
    avgGain = (avgGain*(period-1)+g)/period;
    avgLoss = (avgLoss*(period-1)+l)/period;
    rs = avgLoss===0 ? 100 : avgGain/avgLoss;
    rsiArr.push(100 - (100/(1+rs)));
  }
  // محاذاة الطول بإضافة nulls للبدايات
  const pad = closes.length - rsiArr.length;
  return Array(pad).fill(null).concat(rsiArr);
}

// جلب كل الكلاينز لرمز/فريم
async function getKlines(symbol, interval, limit=200){
  const url = `${API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url); if(!res.ok) throw new Error("klines fail");
  const data = await res.json();
  const closes = data.map(k=>parseFloat(k[4]));
  return {closes};
}

// تحليل رمز واحد وإرجاع إشارة شراء إن توفرت
async function analyzeSymbol(symbol, interval){
  try{
    const {closes} = await getKlines(symbol, interval, 200);
    if(closes.length < 50) return null;

    // EMAs
    const ema9  = ema(closes,9);
    const ema21 = ema(closes,21);

    // آخر قيم
    const cLen = closes.length;
    const close = closes[cLen-1];
    const e9Now  = ema9[cLen-1];
    const e21Now = ema21[cLen-1];

    // تقاطع صاعد (EMA9 فوق EMA21 الآن وكان تحتها في الشمعة السابقة)
    const crossUp =
      ema9[cLen-1] > ema21[cLen-1] &&
      ema9[cLen-2] <= ema21[cLen-2];

    // RSI
    const rsiArr = rsi(closes,14);
    const rsiNow = rsiArr[rsiArr.length-1];

    // شروط الإشارة (يمكن تعديلها)
    const ok = crossUp && rsiNow>=40 && rsiNow<=65 && close>e21Now;
    if(!ok) return null;

    // أهداف/وقف (أهداف صغيرة وسريعة)
    const tp1 = +(close*1.003).toFixed(4);  // +0.3%
    const tp2 = +(close*1.006).toFixed(4);  // +0.6%
    const tp3 = +(close*1.01 ).toFixed(4);  // +1.0%
    const sl  = +(close*0.99 ).toFixed(4);  // -1.0% وقف مبدئي

    return {
      symbol, entry:+close.toFixed(4), tp1, tp2, tp3, sl,
      reason:`Cross EMA9>EMA21 + RSI ${rsiNow.toFixed(1)}`
    };
  }catch{ return null; }
}

// جلب العملات الرائجة (USDT) وفرزها
async function getTrending(){
  const res = await fetch(`${API}/api/v3/ticker/24hr`);
  const data = await res.json();

  const usdt = data.filter(d =>
    d.symbol.endsWith("USDT") &&
    !/UPUSDT|DOWNUSDT|BULL|BEAR/i.test(d.symbol)
  );

  // رائج = أكبر حجم تداول بالدولار (quoteVolume) وأيضًا أكبر تغير %
  usdt.forEach(d=>{
    d.qv = parseFloat(d.quoteVolume||"0");
    d.ch = parseFloat(d.priceChangePercent||"0");
  });

  const byVol = [...usdt].sort((a,b)=>b.qv-a.qv).slice(0, SCAN_COUNT);
  const byChg = [...usdt].sort((a,b)=>Math.abs(b.ch)-Math.abs(a.ch)).slice(0, SCAN_COUNT);

  // دمج وتفريد
  const map = new Map();
  [...byVol, ...byChg].forEach(d=>map.set(d.symbol, d));
  return [...map.values()].slice(0, SCAN_COUNT);
}

// تعبئة جدول
function fillTrending(rows){
  tblTrending.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.symbol}</td>
      <td class="${r.ch>=0?'ok':'warn'}">${r.ch.toFixed(2)}%</td>
      <td>${Number(r.qv).toLocaleString()}</td>
    `;
    tr.onclick = ()=> loadChart(r.symbol);
    tblTrending.appendChild(tr);
  });
}

// تعبئة توصيات
function fillSignals(sigs){
  tblSignals.innerHTML = "";
  if(!sigs.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7">لا توجد إشارات مطابقة الآن.</td>`;
    tblSignals.appendChild(tr);
    return;
  }
  sigs.forEach(s=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.symbol}</td>
      <td>${s.entry}</td>
      <td>${s.tp1}</td>
      <td>${s.tp2}</td>
      <td>${s.tp3}</td>
      <td>${s.sl}</td>
      <td>${s.reason}</td>
    `;
    tr.onclick = ()=> loadChart(s.symbol);
    tblSignals.appendChild(tr);
  });
}

// تحميل الشارت
function loadChart(symbol){
  document.getElementById("symbol").value = symbol;
  document.getElementById("chart").innerHTML = "";
  new TradingView.widget({
    container_id: "chart",
    symbol,
    interval: document.getElementById("interval").value.replace("m","").replace("h","60").replace("d","1D"),
    width: "100%", height: 520, theme: "light",
    locale: "ar", style: "1", toolbar_bg:"#f1f3f6", enable_publishing:false
  });
}

// مهمة المسح الرئيسية
async function runScan(){
  try{
    note.textContent = "⏳ جارِ فحص السوق واستخلاص الإشارات…";
    const interval = document.getElementById("interval").value;
    const trending = await getTrending();
    fillTrending(trending);

    // حلّل كل رمز من الرائجة بالتوازي
    const results = await Promise.all(trending.map(t => analyzeSymbol(t.symbol, interval)));
    const signals = results.filter(Boolean);
    fillSignals(signals);

    lastRun.textContent = "آخر تحديث: " + new Date().toLocaleString();
    if(signals.length){
      notify(`إشارات جديدة: ${signals.map(s=>s.symbol).join(", ")}`);
    }
    note.textContent = `✅ تم — عُثر على ${signals.length} إشارة.`;
  }catch(e){
    note.textContent = "❌ تعذر الفحص، حاول لاحقًا.";
  }
}

// ربط الأزرار
document.getElementById("btnUpdate").onclick = runScan;
// تحميل أولي + تشغيل شارت أولي
runScan().then(()=> loadChart(document.getElementById("symbol").value));
// تكرار كل 30 دقيقة
setInterval(runScan, 30*60*1000);
// ===== إعدادات عامة =====
const API = "https://api.binance.com";
let SCAN_COUNT = 60; // يمكن تغييره من الواجهة
const note = document.getElementById("note");
const lastRun = document.getElementById("lastRun");
const tblTrending = document.querySelector("#tblTrending tbody");
const tblSignals  = document.querySelector("#tblSignals tbody");
const ding = document.getElementById("ding");

// لمنع تكرار التنبيه لنفس الرمز
const alerted = new Set();

// طلب صلاحية إشعارات المتصفح
(async () => {
  try{
    if ("Notification" in window && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }
  }catch{}
})();

// أدوات حساب
function ema(values, period){
  const k = 2/(period+1); let emaArr=[]; let prev;
  values.forEach((v,i)=>{ if(i===0){prev=v;emaArr.push(v);} else {prev=v*k+prev*(1-k); emaArr.push(prev);} });
  return emaArr;
}
function rsi(closes, period=14){
  if(closes.length<=period) return Array(closes.length).fill(null);
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){ const ch=closes[i]-closes[i-1]; if(ch>=0) gains+=ch; else losses+=-ch; }
  let avgGain=gains/period, avgLoss=losses/period, rs=avgLoss===0?100:avgGain/avgLoss;
  let arr=[100-(100/(1+rs))];
  for(let i=period+1;i<closes.length;i++){
    const ch=closes[i]-closes[i-1], g=ch>0?ch:0, l=ch<0?-ch:0;
    avgGain=(avgGain*(period-1)+g)/period; avgLoss=(avgLoss*(period-1)+l)/period;
    rs=avgLoss===0?100:avgGain/avgLoss; arr.push(100-(100/(1+rs)));
  }
  const pad=closes.length-arr.length; return Array(pad).fill(null).concat(arr);
}

// Binance helpers
async function getKlines(symbol, interval, limit=250){
  const url = `${API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url); if(!res.ok) throw new Error("klines fail");
  const data = await res.json(); const closes=data.map(k=>parseFloat(k[4]));
  return {closes};
}
async function get24h(){
  const res = await fetch(`${API}/api/v3/ticker/24hr`); if(!res.ok) throw new Error("24h fail");
  return res.json();
}

// منطق “سخونة الزخم”
function momentumScore(d){ // بسيط: تغير% + جذر الحجم
  const ch = parseFloat(d.priceChangePercent||"0");
  const qv = Math.sqrt(parseFloat(d.quoteVolume||"0"));
  return ch + qv/10000;
}

// توصية شراء “smart-trade” مبسطة
async function analyzeSymbol(symbol, interval){
  try{
    const {closes} = await getKlines(symbol, interval, 200);
    if(closes.length<60) return null;

    const ema9  = ema(closes,9);
    const ema21 = ema(closes,21);
    const cLen = closes.length, close=closes[cLen-1];

    const crossUp = ema9[cLen-1] > ema21[cLen-1] && ema9[cLen-2] <= ema21[cLen-2];
    const rsiArr = rsi(closes,14); const r = rsiArr[rsiArr.length-1];

    const ideal = crossUp && r>=40 && r<=65 && close>ema21[cLen-1];
    if(!ideal) return null;

    // أهداف سريعة (يمكن تعديل النِسب)
    const tp1 = +(close*1.003).toFixed(4);   // +0.3%
    const tp2 = +(close*1.007).toFixed(4);   // +0.7%
    const tp3 = +(close*1.012).toFixed(4);   // +1.2%
    const sl  = +(close*0.988).toFixed(4);   // -1.2%

    return {
      symbol, entry:+close.toFixed(4), tp1, tp2, tp3, sl,
      reason:`EMA9>EMA21 + RSI ${r? r.toFixed(1):'—'}`,
      time: new Date().toLocaleString()
    };
  }catch{ return null; }
}

// بناء الجداول
function fillTrending(rows){
  tblTrending.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    const ch = parseFloat(r.priceChangePercent||"0");
    const qv = Number(r.quoteVolume||"0");
    const hot = momentumScore(r);
    tr.innerHTML = `
      <td>${r.symbol}</td>
      <td class="${ch>=0?'ok':'warn'}">${ch.toFixed(2)}%</td>
      <td>${qv.toLocaleString()}</td>
      <td>${hot.toFixed(2)}</td>
    `;
    tr.onclick = ()=> loadChart(r.symbol);
    tblTrending.appendChild(tr);
  });
}
function fillSignals(sigs){
  tblSignals.innerHTML = "";
  if(!sigs.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="8">لا توجد إشارات مطابقة الآن.</td>`;
    tblSignals.appendChild(tr); return;
  }
  sigs.forEach(s=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.symbol}</td>
      <td>${s.entry}</td>
      <td>${s.tp1}</td>
      <td>${s.tp2}</td>
      <td>${s.tp3}</td>
      <td>${s.sl}</td>
      <td>${s.time}</td>
      <td>${s.reason}</td>
    `;
    tr.onclick = ()=> loadChart(s.symbol);
    tblSignals.appendChild(tr);
  });
}

// شارت
function loadChart(symbol){
  document.getElementById("chart").innerHTML = "";
  new TradingView.widget({
    container_id:"chart", symbol:`BINANCE:${symbol}`,
    interval: document.getElementById("interval").value.replace("m","").replace("h","60"),
    width:"100%", height:520, theme:"light", locale:"ar",
    style:"1", toolbar_bg:"#f1f3f6", enable_publishing:false
  });
}

// إشعار (صوت + Notification + OneSignal إن وُجد)
function alertSignal(s){
  try{ ding.currentTime = 0; ding.play(); }catch{}
  if ("Notification" in window && Notification.permission==="granted"){
    new Notification(`إشارة شراء: ${s.symbol}`, { body:`دخول ${s.entry} | TP1 ${s.tp1} | SL ${s.sl}` });
  }
  if (window.OneSignal){
    // إشعار Push (يتطلب App ID صحيح واشتراك المستخدم)
    OneSignal.push(function(){
      OneSignal.isPushNotificationsEnabled(function(isEnabled){
        if(isEnabled){
          OneSignal.sendSelfNotification(
            `إشارة ${s.symbol}`,
            `دخول ${s.entry} | TP1 ${s.tp1} | SL ${s.sl}`,
            "", { }, [{id:"open", text:"فتح"}]
          );
        }
      });
    });
  }
}

// تشغيل فحص رئيسي
async function runScan(){
  try{
    note.textContent = "⏳ جارِ فحص السوق…";
    const interval = document.getElementById("interval").value;
    SCAN_COUNT = parseInt(document.getElementById("scanCount").value,10);

    // احصل على 24h ثم رشّح USDT واستبعد الرموز العكسية (UP/DOWN/BULL/BEAR)
    const all = await get24h();
    const usdt = all.filter(d =>
      d.symbol.endsWith("USDT") && !/UPUSDT|DOWNUSDT|BULL|BEAR/i.test(d.symbol)
    );

    // أعلى حجم وأعلى تغيّر
    usdt.forEach(d=>{ d.qv=parseFloat(d.quoteVolume||"0"); d.ch=parseFloat(d.priceChangePercent||"0"); });
    const byVol = [...usdt].sort((a,b)=>b.qv-a.qv).slice(0, SCAN_COUNT);
    const byChg = [...usdt].sort((a,b)=>Math.abs(b.ch)-Math.abs(a.ch)).slice(0, SCAN_COUNT);

    // دمج وتقييم الزخم
    const map = new Map(); [...byVol, ...byChg].forEach(d=>map.set(d.symbol,d));
    const trending = [...map.values()]
      .map(d=>({ ...d, score: momentumScore(d)}))
      .sort((a,b)=>b.score-a.score)
      .slice(0, SCAN_COUNT);

    fillTrending(trending);

    // حلّل بالتوازي (قد يأخذ ثوانٍ)
    const analyzed = await Promise.all(trending.map(t => analyzeSymbol(t.symbol, interval)));
    const signals = analyzed.filter(Boolean);

    fillSignals(signals);
    lastRun.textContent = "آخر تحديث: " + new Date().toLocaleString();
    note.textContent = `✅ تم — عُثر على ${signals.length} إشارة.`;

    // تنبيه لأول ظهور إشارة لكل رمز
    signals.forEach(s=>{
      if(!alerted.has(s.symbol)){
        alerted.add(s.symbol);
        alertSignal(s);
      }
    });
  }catch(e){
    note.textContent = "❌ تعذر الفحص. أعد المحاولة لاحقًا.";
  }
}

// أحداث
document.getElementById("btnUpdate").onclick = runScan;

// تشغيل أول مرّة + تكرار كل 30 دقيقة
runScan().then(()=> loadChart("BTCUSDT"));
setInterval(runScan, 30*60*1000);
