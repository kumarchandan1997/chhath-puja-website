document.addEventListener("DOMContentLoaded", async () => {
  if (!App.ready()) return;
  async function refresh() {
    try {
      const [donations, materials] = await Promise.all([App.loadDonations(), App.loadMaterials()]);
      const total = donations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      document.getElementById("total-donations").textContent = App.money(total);
      document.getElementById("material-count").textContent = materials.length.toLocaleString("hi-IN");
      document.getElementById("donor-count").textContent = donations.length.toLocaleString("hi-IN");
      const totals = new Map();
      donations.forEach(item => {
        const name = (item.name || "अज्ञात").trim();
        totals.set(name, (totals.get(name) || 0) + Number(item.amount || 0));
      });
      const top = [...totals.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
      const el = document.getElementById("top-donors");
      el.innerHTML = top.length ? top.map(([name, amount], i) => `
        <article class="donor-card"><span class="rank">${["🥇","🥈","🥉","4","5"][i]}</span><div><h3>${App.escape(name)}</h3><p>दान के लिए हार्दिक धन्यवाद</p></div><strong>${App.money(amount)}</strong></article>`).join("") : `<div class="empty-state">अभी तक कोई चंदा रिकॉर्ड नहीं जोड़ा गया है।</div>`;
    } catch (e) {
      App.toast(e.message || "डेटा लोड नहीं हो सका।", true);
      document.getElementById("top-donors").innerHTML = `<div class="empty-state">डेटा लोड नहीं हो सका। Supabase सेटिंग और SQL की जाँच करें।</div>`;
    }
  }
  await refresh();
  setInterval(refresh, 30000);
  try {
    await App.subscribe("chanda_records", refresh);
    await App.subscribe("material_records", refresh);
  } catch (_) {}
});
