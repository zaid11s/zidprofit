document.getElementById("fetch").addEventListener("click", function() {
    let symbol = document.getElementById("symbol").value;
    let interval = document.getElementById("interval").value;
    alert(`جاري جلب البيانات للرمز: ${symbol} والفريم: ${interval}`);
});
