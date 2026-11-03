(() => {
  "use strict";

  const TABLE = "chanda_records";
  const BUCKET = window.STORAGE_BUCKET || "donor-images";
  const SESSION_KEY = "chhath_admin_mobile";
  const PAGE_SIZE = 10;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  const $ = (id) => document.getElementById(id);
  const list = $("donation-list");
  const form = $("donation-form");
  const modal = $("donation-modal");
  const formMessage = $("donation-form-message");
  const saveButton = $("save-donation");
  const galleryInput = $("donor-gallery-image");
  const cameraInput = $("donor-camera-image");
  const imageInput = $("donor-image");
  const previewBox = $("donor-photo-preview");
  const previewImage = $("donor-photo-preview-image");
  const previewName = $("donor-photo-file-name");
  const previewSize = $("donor-photo-file-size");

  let db = null;
  let records = [];
  let page = 1;
  let search = "";
  let editingId = null;
  let currentImageUrl = null;
  let removeCurrentImage = false;
  let previewUrl = null;
  let busy = false;

  if (
    window.supabase?.createClient &&
    window.SUPABASE_URL &&
    window.SUPABASE_ANON_KEY
  ) {
    db = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY,
    );
  }

  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (v) =>
    new Intl.NumberFormat("hi-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(v) || 0);
  const date = (v) => {
    if (!v) return "तारीख उपलब्ध नहीं";
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? "तारीख उपलब्ध नहीं"
      : d.toLocaleDateString("hi-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  };
  const isAdmin = () => Boolean(sessionStorage.getItem(SESSION_KEY));

  function toast(message, error = false) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
  }

  function message(text, type = "success") {
    if (!formMessage) return;
    formMessage.textContent = text;
    formMessage.className =
      type === "error" ? "donation-error" : "donation-success";
    formMessage.style.display = "block";
  }
  function clearMessage() {
    if (formMessage) {
      formMessage.textContent = "";
      formMessage.className = "";
      formMessage.style.display = "none";
    }
  }

  function setAdminControls() {
    const loggedIn = isAdmin();
    const add = $("open-donation-modal");
    if (add) add.style.display = loggedIn ? "inline-flex" : "none";
    document
      .querySelectorAll(".donation-edit-button")
      .forEach((btn) => (btn.hidden = !loggedIn));
  }

  function resetPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    if (imageInput) imageInput.value = "";
    if (galleryInput) galleryInput.value = "";
    if (cameraInput) cameraInput.value = "";
    if (previewImage) previewImage.removeAttribute("src");
    if (previewBox) previewBox.hidden = true;
    if (previewName) previewName.textContent = "";
    if (previewSize) previewSize.textContent = "";
  }

  function selectPhoto(file) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      message("JPG, PNG, WEBP या GIF फोटो चुनें।", "error");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      message("फोटो 5 MB से कम होनी चाहिए।", "error");
      return;
    }
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      imageInput.files = dt.files;
    } catch {
      message("फोटो चुनने में समस्या हुई। दोबारा प्रयास करें।", "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    previewName.textContent = file.name || "चुनी गई फोटो";
    previewSize.textContent = (file.size / 1048576).toFixed(2) + " MB";
    previewBox.hidden = false;
    removeCurrentImage = false;
    clearMessage();
  }
  galleryInput?.addEventListener("change", () =>
    selectPhoto(galleryInput.files?.[0]),
  );
  cameraInput?.addEventListener("change", () =>
    selectPhoto(cameraInput.files?.[0]),
  );
  $("remove-donor-photo")?.addEventListener("click", () => {
    resetPhoto();
    if (editingId && currentImageUrl) {
      removeCurrentImage = true;
      message("पुरानी फोटो हटाने के लिए Update सेव करें।");
    } else clearMessage();
  });

  async function uploadPhoto(file) {
    if (!db) throw new Error("Supabase कनेक्शन उपलब्ध नहीं है।");
    if (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE)
      throw new Error("कृपया 5 MB से कम JPG, PNG, WEBP या GIF फोटो चुनें।");
    const ext = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    }[file.type];
    const key = `chanda/${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(key, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: "3600",
      });
    if (error) throw error;
    return db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  function openModal(record = null) {
    if (!isAdmin()) {
      toast("यह सुविधा केवल Admin के लिए है।", true);
      return;
    }
    editingId = record ? record.id : null;
    currentImageUrl = record?.image_url || null;
    removeCurrentImage = false;
    form.reset();
    resetPhoto();
    clearMessage();
    $("donation-modal-title").textContent = record
      ? "✏️ चंदा विवरण संपादित करें"
      : "➕ नया चंदा जोड़ें";
    saveButton.textContent = record ? "बदलाव सेव करें" : "चंदा सेव करें";
    if (record) {
      form.elements.namedItem("name").value = record.name || "";
      form.elements.namedItem("mobile").value = record.mobile || "";
      form.elements.namedItem("address").value = record.address || "";
      form.elements.namedItem("amount").value = record.amount ?? "";
      form.elements.namedItem("remarks").value = record.remarks || "";
      if (record.image_url) {
        previewImage.src = record.image_url;
        previewName.textContent = "मौजूदा फोटो";
        previewSize.textContent = "नई फोटो चुनने पर पुरानी फोटो बदल जाएगी";
        previewBox.hidden = false;
      }
    }
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => form.elements.namedItem("name")?.focus(), 60);
  }
  function closeModal() {
    if (busy) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    form.reset();
    resetPhoto();
    clearMessage();
    editingId = null;
    currentImageUrl = null;
    removeCurrentImage = false;
    $("donation-modal-title").textContent = "➕ नया चंदा जोड़ें";
    saveButton.textContent = "चंदा सेव करें";
  }
  $("open-donation-modal")?.addEventListener("click", () => openModal());
  $("close-donation-modal")?.addEventListener("click", closeModal);
  $("cancel-donation")?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeViewer();
    }
  });

  function profilePlaceholder(name) {
    const initial = esc(
      (
        String(name || "दाता")
          .trim()
          .charAt(0) || "द"
      ).toUpperCase(),
    );
    return `<div class="donation-image-placeholder" aria-label="डिफॉल्ट प्रोफाइल फोटो"><span>${initial}</span><small>दानदाता</small></div>`;
  }

  function imageMarkup(record) {
    if (!record.image_url) return profilePlaceholder(record.name);
    return `<button type="button" class="donation-image-button" data-view-image="${esc(record.id)}" aria-label="${esc(record.name)} की फोटो बड़ी देखें"><img class="donation-image" src="${esc(record.image_url)}" alt="${esc(record.name)} की फोटो" loading="lazy"></button>`;
  }

  function render() {
    if (!list) return;
    const q = search.toLowerCase();
    const filtered = records.filter(
      (r) =>
        !q ||
        [r.name, r.mobile, r.address, r.remarks, r.amount].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
        ),
    );
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);
    $("donation-summary").textContent =
      `कुल ${filtered.length} रिकॉर्ड • पृष्ठ ${page}/${pages}`;
    if (!visible.length) {
      list.innerHTML = `<div class="donation-empty"><h3>कोई रिकॉर्ड नहीं मिला</h3><p>${q ? "दूसरे नाम या शब्द से खोजें।" : "अभी कोई चंदा दर्ज नहीं है।"}</p></div>`;
      $("donation-pagination").innerHTML = "";
      return;
    }
    list.innerHTML = visible
      .map(
        (r, i) => `
      <article class="donation-card">
        <div class="donation-photo-frame">${imageMarkup(r)}</div>
        <div class="donation-card-body">
          <div class="donation-card-top"><h3>${esc(r.name)}</h3><span class="donation-rank">${start + i === 0 ? "🏆 " : ""}#${start + i + 1}</span></div>
          <div class="donation-amount">${money(r.amount)}</div>
          <p class="donation-info">📍 ${esc(r.address || "पता उपलब्ध नहीं")}</p>
          <p class="donation-info">📅 ${date(r.created_at)}</p>
          <div id="donation-details-${esc(r.id)}" class="donation-details">
            <p class="donation-info"><strong>मोबाइल:</strong> ${esc(r.mobile || "उपलब्ध नहीं")}</p>
            <p class="donation-info"><strong>टिप्पणी:</strong> ${esc(r.remarks || "कोई टिप्पणी नहीं")}</p>
          </div>
          <div class="donation-card-actions">
            <button type="button" class="btn btn-secondary donation-more" data-details-id="${esc(r.id)}" aria-expanded="false">अधिक जानकारी देखें</button>
            <button type="button" class="btn btn-primary donation-edit-button" data-edit-id="${esc(r.id)}" ${isAdmin() ? "" : "hidden"}>✏️ Edit</button>
          </div>
        </div>
      </article>`,
      )
      .join("");
    renderPagination(filtered.length, pages);
    setAdminControls();
  }

  function renderPagination(total, pages) {
    const el = $("donation-pagination");
    if (!el) return;
    el.innerHTML = "";
    if (total <= PAGE_SIZE) return;
    const add = (label, p, disabled, active = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.disabled = disabled;
      if (active) b.classList.add("active");
      b.addEventListener("click", () => {
        page = p;
        render();
        list.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      el.appendChild(b);
    };
    add("← पिछला", page, page === 1);
    for (let p = 1; p <= pages; p++) add(String(p), p, false, p === page);
    add("अगला →", page + 1, page === pages);
  }

  async function load() {
    if (!db) {
      list.innerHTML = `<div class="donation-empty"><h3>Supabase कनेक्शन उपलब्ध नहीं</h3><p>assets/js/config.js जाँचें।</p></div>`;
      return;
    }
    list.innerHTML = `<div class="donation-loading">चंदा सूची लोड हो रही है...</div>`;
    try {
      const { data, error } = await db
        .from(TABLE)
        .select("id,name,mobile,address,amount,remarks,image_url,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      records = (data || []).sort(
        (a, b) => Number(b.amount || 0) - Number(a.amount || 0),
      );
      $("total-donors").textContent = records.length;
      $("total-donation").textContent = money(
        records.reduce((s, r) => s + Number(r.amount || 0), 0),
      );
      $("highest-donation").textContent = money(
        records.length
          ? Math.max(...records.map((r) => Number(r.amount || 0)))
          : 0,
      );
      render();
    } catch (e) {
      console.error(e);
      list.innerHTML = `<div class="donation-empty"><h3>रिकॉर्ड लोड नहीं हो सके</h3><p>${esc(e.message || "कृपया दोबारा प्रयास करें।")}</p><button id="retry-load" class="btn btn-primary">Retry</button></div>`;
      $("retry-load")?.addEventListener("click", load);
    }
  }

  list?.addEventListener("click", (e) => {
    const more = e.target.closest("[data-details-id]");
    if (more) {
      const box = $("donation-details-" + more.dataset.detailsId);
      const open = box?.classList.toggle("open");
      more.setAttribute("aria-expanded", String(!!open));
      more.textContent = open ? "कम जानकारी दिखाएँ" : "अधिक जानकारी देखें";
      return;
    }
    const edit = e.target.closest("[data-edit-id]");
    if (edit) {
      if (!isAdmin()) {
        toast("कृपया Admin Login करें।", true);
        return;
      }
      const row = records.find(
        (r) => String(r.id) === String(edit.dataset.editId),
      );
      if (row) openModal(row);
      return;
    }
    const image = e.target.closest("[data-view-image]");
    if (image) {
      const row = records.find(
        (r) => String(r.id) === String(image.dataset.viewImage),
      );
      if (row?.image_url) showViewer(row.image_url, row.name);
    }
  });

  function showViewer(src, alt) {
    let viewer = $("donation-image-viewer");
    if (!viewer) {
      viewer = document.createElement("div");
      viewer.id = "donation-image-viewer";
      viewer.className = "donation-image-viewer";
      viewer.innerHTML = `<button type="button" class="viewer-close" aria-label="बंद करें">×</button><img alt="बड़ी फोटो">`;
      document.body.appendChild(viewer);
      viewer.addEventListener("click", (e) => {
        if (e.target === viewer || e.target.closest(".viewer-close"))
          closeViewer();
      });
    }
    viewer.querySelector("img").src = src;
    viewer.querySelector("img").alt = alt || "दानदाता की फोटो";
    viewer.classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function closeViewer() {
    const v = $("donation-image-viewer");
    if (v) {
      v.classList.remove("show");
      document.body.style.overflow = modal?.classList.contains("open")
        ? "hidden"
        : "";
    }
  }

  $("donation-search")?.addEventListener("input", (e) => {
    search = e.target.value.trim();
    page = 1;
    render();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!isAdmin()) {
      message("कृपया पहले Admin Login करें।", "error");
      return;
    }
    if (!db) {
      message("Supabase कनेक्शन उपलब्ध नहीं है।", "error");
      return;
    }
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      mobile: String(fd.get("mobile") || "").trim() || null,
      address: String(fd.get("address") || "").trim() || null,
      amount: Number(fd.get("amount")),
      remarks: String(fd.get("remarks") || "").trim() || null,
    };
    const file = imageInput?.files?.[0] || null;
    if (!payload.name) {
      message("दानदाता का नाम भरें।", "error");
      return;
    }
    if (!Number.isFinite(payload.amount) || payload.amount < 1) {
      message("राशि कम से कम ₹1 होनी चाहिए।", "error");
      return;
    }
    if (
      file &&
      (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE)
    ) {
      message("मान्य फोटो चुनें (JPG/PNG/WEBP/GIF, अधिकतम 5 MB)।", "error");
      return;
    }
    busy = true;
    saveButton.disabled = true;
    saveButton.textContent = editingId
      ? "अपडेट हो रहा है..."
      : "सेव हो रहा है...";
    try {
      let imageUrl = currentImageUrl;
      if (file) imageUrl = await uploadPhoto(file);
      if (removeCurrentImage && !file) imageUrl = null;
      payload.image_url = imageUrl;
      // ==========================================
      // UPDATE EXISTING DONATION OR INSERT NEW
      // ==========================================

      const isEditing = Boolean(editingId);

      if (isEditing) {
        console.log("Updating donation ID:", editingId);
        console.log("Update payload:", payload);

        const { data, error } = await db
          .from(TABLE)
          .update(payload)
          .eq("id", editingId)
          .select(
            "id, name, mobile, address, amount, remarks, image_url, created_at",
          )
          .maybeSingle();

        // Supabase error
        if (error) {
          console.error("Supabase update error:", error);
          throw error;
        }

        // No row was updated
        if (!data) {
          throw new Error(
            "कोई रिकॉर्ड अपडेट नहीं हुआ। कृपया Supabase RLS UPDATE और SELECT permissions जाँचें।",
          );
        }

        console.log("Updated record:", data);

        toast("✅ दानदाता का विवरण सफलतापूर्वक अपडेट हो गया!");
      } else {
        const { data, error } = await db
          .from(TABLE)
          .insert([payload])
          .select(
            "id, name, mobile, address, amount, remarks, image_url, created_at",
          )
          .single();

        if (error) {
          console.error("Supabase insert error:", error);
          throw error;
        }

        if (!data) {
          throw new Error("नया रिकॉर्ड सेव नहीं हुआ।");
        }

        console.log("Inserted record:", data);

        toast("🙏 नया चंदा सफलतापूर्वक सेव हो गया!");
      }

      // Close modal only after successful database operation
      closeModal();

      // Reload latest data from Supabase
      await load();
    } catch (err) {
      console.error(err);
      message(
        "सेव नहीं हो सका: " + (err.message || "कृपया दोबारा प्रयास करें।"),
        "error",
      );
    } finally {
      busy = false;
      saveButton.disabled = false;
      saveButton.textContent = editingId ? "बदलाव सेव करें" : "चंदा सेव करें";
    }
  });

  $("export-donations")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chanda-records.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  window.addEventListener("chhath-admin-login-changed", setAdminControls);
  window.addEventListener("storage", setAdminControls);
  document.addEventListener("DOMContentLoaded", () => {
    setAdminControls();
    load();
  });
})();
