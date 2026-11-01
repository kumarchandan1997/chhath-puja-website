document.addEventListener("DOMContentLoaded", async () => {
  if (!App.ready()) return;
  const form = document.getElementById("material-form"), search = document.getElementById("material-search");
  const totalInput = form.elements.total_amount, advanceInput = form.elements.advance_paid;
  let all = [], filtered = [], page = 1;
  const list = document.getElementById("material-list");
  const updateBalance = () => {
    const balance = Math.max(0, Number(totalInput.value || 0) - Number(advanceInput.value || 0));
    document.getElementById("balance-preview").textContent = App.money(balance);
  };
  totalInput.addEventListener("input", updateBalance); advanceInput.addEventListener("input", updateBalance);
  const render = () => {
    const q = search.value.trim().toLocaleLowerCase("hi-IN");
    filtered = all.filter(x => [x.material_name, x.description, x.details_description].some(v => String(v || "").toLocaleLowerCase("hi-IN").includes(q)));
    const pages = Math.max(1, Math.ceil(filtered.length / App.PAGE_SIZE)); if (page > pages) page = pages;
    const rows = filtered.slice((page-1)*App.PAGE_SIZE, page*App.PAGE_SIZE);
    document.getElementById("material-summary").textContent = `${filtered.length.toLocaleString("hi-IN")} सामग्री • कुल रकम ${App.money(filtered.reduce((s,x)=>s+Number(x.total_amount||0),0))}`;
    list.innerHTML = rows.length ? rows.map(x => {
      const balance = Math.max(0, Number(x.total_amount || 0) - Number(x.advance_paid || 0));
      return `<article class="material-card">
        ${x.image_url ? `<img class="material-image" src="${App.escape(x.image_url)}" alt="${App.escape(x.material_name)}" loading="lazy">` : `<div class="material-image image-placeholder">🧺</div>`}
        <div class="material-body"><div class="record-title-line"><h3>${App.escape(x.material_name)}</h3><span class="date-chip">${App.date(x.created_at)}</span></div>
        ${x.description ? `<p class="material-short">${App.escape(x.description)}</p>` : ""}
        ${x.details_description ? `<p class="record-description">${App.escape(x.details_description)}</p>` : ""}
        <div class="money-grid"><div><small>कुल रकम</small><strong>${App.money(x.total_amount)}</strong></div><div><small>अग्रिम भुगतान</small><strong>${App.money(x.advance_paid)}</strong></div><div><small>बाकी रकम</small><strong class="balance">${App.money(balance)}</strong></div></div>
        </div></article>`;
    }).join("") : `<div class="empty-state">कोई सामग्री रिकॉर्ड नहीं मिला।</div>`;
    App.setPagination("material-pagination", page, filtered.length, p => { page = p; render(); window.scrollTo({top: document.querySelector(".list-section").offsetTop - 20, behavior:"smooth"}); });
  };
  async function refresh() {
    try { all = await App.loadMaterials(); render(); }
    catch (e) { list.innerHTML = `<div class="empty-state">डेटा नहीं मिला: ${App.escape(e.message)}</div>`; }
  }
  search.addEventListener("input", () => { page = 1; render(); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = "सेव हो रहा है…";
    try {
      const fd = new FormData(form), total = Number(fd.get("total_amount")), advance = Number(fd.get("advance_paid") || 0);
      if (!Number.isFinite(total) || total < 0) throw new Error("कुल रकम सही भरें।");
      if (!Number.isFinite(advance) || advance < 0) throw new Error("अग्रिम भुगतान सही भरें।");
      if (advance > total) throw new Error("अग्रिम भुगतान कुल रकम से अधिक नहीं हो सकता।");
      const image = fd.get("image");
      const imageUrl = image && image.size ? await App.uploadImage(image, "materials") : null;
      const record = { material_name: String(fd.get("material_name")).trim(), description: String(fd.get("description") || "").trim() || null, details_description: String(fd.get("details_description") || "").trim() || null, advance_paid: advance, total_amount: total, image_url: imageUrl };
      const { error } = await App.client().from("material_records").insert(record);
      if (error) throw error;
      form.reset(); advanceInput.value = "0"; updateBalance(); App.toast("सामग्री का रिकॉर्ड सफलतापूर्वक जोड़ दिया गया।"); await refresh();
    } catch (e) { App.toast(e.message || "रिकॉर्ड सेव नहीं हो सका।", true); }
    finally { button.disabled = false; button.textContent = "सामग्री सेव करें"; }
  });
  document.getElementById("export-materials").addEventListener("click", () => App.downloadJson("chhath-materials.json", all));
  updateBalance(); await refresh(); setInterval(refresh, 30000);
  try { await App.subscribe("material_records", refresh); } catch (_) {}
});
