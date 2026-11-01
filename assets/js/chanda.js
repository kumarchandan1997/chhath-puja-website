document.addEventListener("DOMContentLoaded", async () => {
  if (!App.ready()) return;
  const form = document.getElementById("donation-form");
  const search = document.getElementById("donation-search");
  let all = [], filtered = [], page = 1;
  const list = document.getElementById("donation-list");
  const render = () => {
    const q = search.value.trim().toLocaleLowerCase("hi-IN");
    filtered = all.filter(x => [x.name, x.mobile, x.address, x.remarks].some(v => String(v || "").toLocaleLowerCase("hi-IN").includes(q)));
    const pages = Math.max(1, Math.ceil(filtered.length / App.PAGE_SIZE));
    if (page > pages) page = pages;
    const rows = filtered.slice((page-1)*App.PAGE_SIZE, page*App.PAGE_SIZE);
    document.getElementById("donation-summary").textContent = `${filtered.length.toLocaleString("hi-IN")} रिकॉर्ड • कुल ${App.money(filtered.reduce((s,x)=>s+Number(x.amount||0),0))}`;
    list.innerHTML = rows.length ? rows.map(x => `
      <article class="donation-row">
        ${x.image_url ? `<img class="record-image" src="${App.escape(x.image_url)}" alt="दानदाता की फोटो" loading="lazy">` : `<div class="record-image image-placeholder">🙏</div>`}
        <div class="record-main"><div class="record-title-line"><h3>${App.escape(x.name)}</h3><span class="date-chip">${App.date(x.created_at)}</span></div>
        <p class="record-meta">${x.mobile ? `📱 ${App.escape(x.mobile)}` : ""}${x.address ? `　📍 ${App.escape(x.address)}` : ""}</p>
        ${x.remarks ? `<p class="record-description">${App.escape(x.remarks)}</p>` : ""}</div>
        <strong class="amount">${App.money(x.amount)}</strong>
      </article>`).join("") : `<div class="empty-state">कोई रिकॉर्ड नहीं मिला। पहला चंदा आप जोड़ सकते हैं।</div>`;
    App.setPagination("donation-pagination", page, filtered.length, p => { page = p; render(); window.scrollTo({top: document.querySelector(".list-section").offsetTop - 20, behavior:"smooth"}); });
  };
  async function refresh() {
    try { all = await App.loadDonations(); render(); }
    catch (e) { list.innerHTML = `<div class="empty-state">डेटा नहीं मिला: ${App.escape(e.message)}</div>`; }
  }
  search.addEventListener("input", () => { page = 1; render(); });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = "सेव हो रहा है…";
    try {
      const fd = new FormData(form);
      const amount = Number(fd.get("amount"));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("चंदा राशि शून्य से अधिक होनी चाहिए।");
      const image = fd.get("image");
      const imageUrl = image && image.size ? await App.uploadImage(image, "donations") : null;
      const record = { name: String(fd.get("name")).trim(), mobile: String(fd.get("mobile") || "").trim() || null, address: String(fd.get("address") || "").trim() || null, amount, remarks: String(fd.get("remarks") || "").trim() || null, image_url: imageUrl };
      const { error } = await App.client().from("chanda_records").insert(record);
      if (error) throw error;
      form.reset(); App.toast("चंदा रिकॉर्ड सफलतापूर्वक जोड़ दिया गया।"); await refresh();
    } catch (e) { App.toast(e.message || "रिकॉर्ड सेव नहीं हो सका।", true); }
    finally { button.disabled = false; button.textContent = "चंदा सेव करें"; }
  });
  document.getElementById("export-donations").addEventListener("click", () => App.downloadJson("chandanstore.json", all));
  await refresh(); setInterval(refresh, 30000);
  try { await App.subscribe("chanda_records", refresh); } catch (_) {}
});
