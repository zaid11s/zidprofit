// ====== إعدادات عامة ======
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
