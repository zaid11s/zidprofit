function loadChart(symbol, interval) {
    document.getElementById("chart").innerHTML = "";

    new TradingView.widget({
        "container_id": "chart",
        "width": "100%",
        "height": 500,
        "symbol": symbol,
        "interval": interval,
        "timezone": "Etc/UTC",
        "theme": "light",
        "style": "1",
        "locale": "ar",
        "toolbar_bg": "#f1f3f6",
        "enable_publishing": false,
        "allow_symbol_change": true
    });

    fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById("price").textContent = `💰 السعر الحالي لـ ${symbol}: ${parseFloat(data.price).toFixed(2)}$`;
        })
        .catch(() => {
            document.getElementById("price").textContent = "❌ تعذر جلب السعر";
        });
}

document.getElementById("updateChart").addEventListener("click", () => {
    const symbol = document.getElementById("symbol").value.toUpperCase();
    const interval = document.getElementById("interval").value;
    loadChart(symbol, interval);
});

loadChart("BTCUSDT", "30");
