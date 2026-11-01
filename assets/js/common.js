(() => {
  const PAGE_SIZE = 10;
  let supabaseClient = null;
  window.App = {
    PAGE_SIZE,
    client() {
      if (supabaseClient) return supabaseClient;
      if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY ||
          window.SUPABASE_URL.includes("PASTE_") || window.SUPABASE_ANON_KEY.includes("PASTE_")) {
        throw new Error("पहले assets/js/config.js में Supabase URL और publishable/anon key भरें।");
      }
      supabaseClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      return supabaseClient;
    },
    ready() {
      try { this.client(); return true; }
      catch (e) { this.toast(e.message, true); return false; }
    },
    toast(message, error = false) {
      const el = document.getElementById("toast");
      if (!el) return;
      el.textContent = message;
      el.classList.toggle("error", error);
      el.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove("show"), 5000);
    },
    money(value) {
      return new Intl.NumberFormat("hi-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
    },
    date(value) {
      if (!value) return "तारीख उपलब्ध नहीं";
      return new Date(value).toLocaleDateString("hi-IN", { year: "numeric", month: "short", day: "numeric" });
    },
    escape(value) {
      return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    },
    async uploadImage(file, folder) {
      if (!file || !file.size) return null;
      if (!file.type.startsWith("image/")) throw new Error("कृपया केवल इमेज फ़ाइल चुनें।");
      if (file.size > 5 * 1024 * 1024) throw new Error("फोटो का आकार 5 MB से कम रखें।");
      const client = this.client();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const { error } = await client.storage.from(window.STORAGE_BUCKET).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = client.storage.from(window.STORAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    },
    downloadJson(filename, records) {
      const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    },
    setPagination(container, current, total, callback) {
      const el = document.getElementById(container);
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (!el) return;
      if (pages <= 1) { el.innerHTML = ""; return; }
      let html = `<button class="page-btn" ${current <= 1 ? "disabled" : ""} data-page="${current-1}">← पिछला</button>`;
      const start = Math.max(1, current - 2), end = Math.min(pages, current + 2);
      for (let i = start; i <= end; i++) html += `<button class="page-btn ${i === current ? "selected" : ""}" data-page="${i}">${i}</button>`;
      html += `<button class="page-btn" ${current >= pages ? "disabled" : ""} data-page="${current+1}">अगला →</button>`;
      el.innerHTML = html;
      el.querySelectorAll("button[data-page]").forEach(btn => btn.addEventListener("click", () => {
        const page = Number(btn.dataset.page); if (page >= 1 && page <= pages) callback(page);
      }));
    },
    setupMenu() {
      const button = document.querySelector(".menu-toggle"), nav = document.querySelector(".nav-links");
      if (!button || !nav) return;
      button.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        button.setAttribute("aria-expanded", String(open));
      });
    },
    async loadDonations() {
      const { data, error } = await this.client().from("chanda_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async loadMaterials() {
      const { data, error } = await this.client().from("material_records").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async subscribe(table, callback) {
      const client = this.client();
      const channel = client.channel(`public-${table}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, callback).subscribe();
      return channel;
    }
  };
  document.addEventListener("DOMContentLoaded", () => App.setupMenu());
})();
