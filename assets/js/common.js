
(() => {
    "use strict";

    const PAGE_SIZE = 10;
    let supabaseClient = null;

    let toastTimer = null;
    let activeChannels = [];

    window.App = {
        PAGE_SIZE,

        // ==========================================
        // SUPABASE CLIENT
        // ==========================================
        client() {
            if (supabaseClient) {
                return supabaseClient;
            }

            if (
                !window.supabase ||
                !window.SUPABASE_URL ||
                !window.SUPABASE_ANON_KEY ||
                window.SUPABASE_URL.includes("PASTE_") ||
                window.SUPABASE_ANON_KEY.includes("PASTE_")
            ) {
                throw new Error(
                    "पहले assets/js/config.js में Supabase URL और publishable/anon key भरें।"
                );
            }

            supabaseClient = window.supabase.createClient(
                window.SUPABASE_URL,
                window.SUPABASE_ANON_KEY
            );

            return supabaseClient;
        },

        // ==========================================
        // CHECK SUPABASE CONNECTION
        // ==========================================
        ready() {
            try {
                this.client();
                return true;
            } catch (error) {
                this.toast(error.message, true);
                return false;
            }
        },

        // ==========================================
        // TOAST NOTIFICATIONS
        // ==========================================
        toast(message, error = false) {
            let el = document.getElementById("toast");

            if (!el) {
                el = document.createElement("div");
                el.id = "toast";
                el.className = "toast";
                el.setAttribute("role", "status");
                el.setAttribute("aria-live", "polite");
                document.body.appendChild(el);
            }

            el.textContent = message;
            el.classList.toggle("error", error);
            el.classList.add("show");

            clearTimeout(toastTimer);

            toastTimer = setTimeout(() => {
                el.classList.remove("show");
            }, 5000);
        },

        // ==========================================
        // FORMAT INDIAN CURRENCY
        // ==========================================
        money(value) {
            return new Intl.NumberFormat("hi-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 2
            }).format(Number(value || 0));
        },

        // ==========================================
        // FORMAT DATE
        // ==========================================
        date(value) {
            if (!value) {
                return "तारीख उपलब्ध नहीं";
            }

            const date = new Date(value);

            if (Number.isNaN(date.getTime())) {
                return "तारीख उपलब्ध नहीं";
            }

            return date.toLocaleDateString("hi-IN", {
                year: "numeric",
                month: "short",
                day: "numeric"
            });
        },

        // ==========================================
        // HTML ESCAPE
        // ==========================================
        escape(value) {
            return String(value ?? "").replace(
                /[&<>"']/g,
                character => ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                })[character]
            );
        },

        // ==========================================
        // IMAGE URL VALIDATION
        // ==========================================
        isValidImageUrl(value) {
            if (!value) {
                return false;
            }

            try {
                const url = new URL(value, window.location.href);

                return (
                    url.protocol === "https:" ||
                    url.protocol === "http:"
                );
            } catch {
                return false;
            }
        },

        // ==========================================
        // IMAGE UPLOAD TO SUPABASE STORAGE
        // ==========================================
        async uploadImage(file, folder = "uploads") {
            if (!file || !file.size) {
                return null;
            }

            if (!file.type || !file.type.startsWith("image/")) {
                throw new Error("कृपया केवल इमेज फ़ाइल चुनें।");
            }

            const maxSize = 5 * 1024 * 1024;

            if (file.size > maxSize) {
                throw new Error("फोटो का आकार 5 MB से कम रखें।");
            }

            const client = this.client();

            const safeFolder = String(folder)
                .replace(/[^a-zA-Z0-9/_-]/g, "")
                .replace(/^\/+|\/+$/g, "");

            const safeName = file.name
                .replace(/[^a-zA-Z0-9._-]/g, "_");

            const uniqueId = (
                window.crypto &&
                typeof window.crypto.randomUUID === "function"
            )
                ? window.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

            const path = [
                safeFolder,
                `${Date.now()}-${uniqueId}-${safeName}`
            ].filter(Boolean).join("/");

            const bucket = window.STORAGE_BUCKET || "donor-images";

            const { error } = await client.storage
                .from(bucket)
                .upload(path, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file.type
                });

            if (error) {
                throw error;
            }

            const { data } = client.storage
                .from(bucket)
                .getPublicUrl(path);

            if (!data || !data.publicUrl) {
                throw new Error("इमेज URL प्राप्त नहीं हो पाया।");
            }

            return data.publicUrl;
        },

        // ==========================================
        // DOWNLOAD JSON DATA
        // ==========================================
        downloadJson(filename, records) {
            const blob = new Blob(
                [JSON.stringify(records, null, 2)],
                {
                    type: "application/json;charset=utf-8"
                }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        },

        // ==========================================
        // PAGINATION
        // ==========================================
        setPagination(container, current, total, callback) {
            const el = typeof container === "string"
                ? document.getElementById(container)
                : container;

            if (!el) {
                return;
            }

            const pages = Math.max(
                1,
                Math.ceil(Number(total || 0) / PAGE_SIZE)
            );

            current = Math.min(
                Math.max(1, Number(current) || 1),
                pages
            );

            if (pages <= 1) {
                el.innerHTML = "";
                return;
            }

            let html = `
                <button
                    type="button"
                    class="page-btn"
                    data-page="${current - 1}"
                    ${current <= 1 ? "disabled" : ""}
                    aria-label="पिछला पेज"
                >
                    ← पिछला
                </button>
            `;

            const start = Math.max(1, current - 2);
            const end = Math.min(pages, current + 2);

            for (let page = start; page <= end; page++) {
                html += `
                    <button
                        type="button"
                        class="page-btn ${page === current ? "selected" : ""}"
                        data-page="${page}"
                        ${page === current ? 'aria-current="page"' : ""}
                    >
                        ${page}
                    </button>
                `;
            }

            html += `
                <button
                    type="button"
                    class="page-btn"
                    data-page="${current + 1}"
                    ${current >= pages ? "disabled" : ""}
                    aria-label="अगला पेज"
                >
                    अगला →
                </button>
            `;

            el.innerHTML = html;

            el.querySelectorAll("button[data-page]").forEach(button => {
                button.addEventListener("click", () => {
                    const page = Number(button.dataset.page);

                    if (
                        page >= 1 &&
                        page <= pages &&
                        page !== current &&
                        typeof callback === "function"
                    ) {
                        callback(page);
                    }
                });
            });
        },

        // ==========================================
        // NAVBAR MOBILE MENU
        // ==========================================
        setupMenu() {
            const button = document.querySelector(".menu-toggle");
            const nav = document.querySelector(".nav-links");

            if (!button || !nav) {
                return;
            }

            if (button.dataset.menuInitialized === "true") {
                return;
            }

            button.dataset.menuInitialized = "true";

            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-label", "मेन्यू खोलें");

            button.addEventListener("click", () => {
                const isOpen = nav.classList.toggle("open");

                button.setAttribute(
                    "aria-expanded",
                    String(isOpen)
                );

                button.setAttribute(
                    "aria-label",
                    isOpen ? "मेन्यू बंद करें" : "मेन्यू खोलें"
                );

                if (button.querySelector("svg")) {
                    button.setAttribute(
                        "data-menu-state",
                        isOpen ? "open" : "closed"
                    );
                } else {
                    button.textContent = isOpen ? "✕" : "☰";
                }
            });

            // Close menu after clicking a navigation link.
            nav.querySelectorAll("a").forEach(link => {
                link.addEventListener("click", () => {
                    nav.classList.remove("open");

                    button.setAttribute("aria-expanded", "false");
                    button.setAttribute("aria-label", "मेन्यू खोलें");

                    if (!button.querySelector("svg")) {
                        button.textContent = "☰";
                    }
                });
            });

            // Close menu with Escape key.
            document.addEventListener("keydown", event => {
                if (event.key === "Escape") {
                    nav.classList.remove("open");

                    button.setAttribute("aria-expanded", "false");
                    button.setAttribute("aria-label", "मेन्यू खोलें");

                    if (!button.querySelector("svg")) {
                        button.textContent = "☰";
                    }
                }
            });
        },

        // ==========================================
        // NAVBAR SOCIAL MEDIA LINKS
        // ==========================================
        setupSocialLinks() {
            const instagramUrl = window.INSTAGRAM_URL || "";
            const whatsappUrl = window.WHATSAPP_URL || "";

            const instagramElements = document.querySelectorAll(
                "#instagram-link, .nav-instagram"
            );

            const whatsappElements = document.querySelectorAll(
                "#whatsapp-link, .nav-whatsapp"
            );

            instagramElements.forEach(link => {
                if (instagramUrl && this.isValidImageUrl(instagramUrl)) {
                    // Do not overwrite links with invalid protocols.
                    link.href = instagramUrl;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.hidden = false;
                    link.setAttribute("aria-label", "Instagram खोलें");
                } else {
                    link.removeAttribute("href");
                    link.hidden = true;
                }
            });

            whatsappElements.forEach(link => {
                if (whatsappUrl && this.isValidImageUrl(whatsappUrl)) {
                    link.href = whatsappUrl;
                    link.target = "_blank";
                    link.rel = "noopener noreferrer";
                    link.hidden = false;
                    link.setAttribute("aria-label", "WhatsApp पर संपर्क करें");
                } else {
                    link.removeAttribute("href");
                    link.hidden = true;
                }
            });
        },

        // ==========================================
        // LOAD CHANDA / DONATION RECORDS
        // ==========================================
        async loadDonations() {
            const { data, error } = await this.client()
                .from("chanda_records")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) {
                throw error;
            }

            return data || [];
        },

        // ==========================================
        // LOAD MATERIAL RECORDS
        // ==========================================
        async loadMaterials() {
            const { data, error } = await this.client()
                .from("material_records")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) {
                throw error;
            }

            return data || [];
        },

        // ==========================================
        // SUPABASE REAL-TIME SUBSCRIPTION
        // ==========================================
        async subscribe(table, callback) {
            const client = this.client();

            const channel = client
                .channel(
                    `public-${table}-${Math.random().toString(36).slice(2)}`
                )
                .on(
                    "postgres_changes",
                    {
                        event: "*",
                        schema: "public",
                        table: table
                    },
                    callback
                )
                .subscribe();

            activeChannels.push(channel);

            return channel;
        },

        // ==========================================
        // REMOVE REAL-TIME SUBSCRIPTION
        // ==========================================
        async unsubscribe(channel) {
            if (!channel || !supabaseClient) {
                return;
            }

            try {
                await supabaseClient.removeChannel(channel);
            } finally {
                activeChannels = activeChannels.filter(
                    item => item !== channel
                );
            }
        },

        // ==========================================
        // REMOVE ALL REAL-TIME SUBSCRIPTIONS
        // ==========================================
        async unsubscribeAll() {
            if (!supabaseClient) {
                activeChannels = [];
                return;
            }

            const channels = [...activeChannels];
            activeChannels = [];

            await Promise.all(
                channels.map(channel =>
                    supabaseClient.removeChannel(channel)
                )
            );
        },

        // ==========================================
        // MODAL HELPERS
        // ==========================================
        openModal(modal) {
            const el = typeof modal === "string"
                ? document.getElementById(modal)
                : modal;

            if (!el) {
                return;
            }

            el.classList.add("show");
            el.setAttribute("aria-hidden", "false");
            document.body.classList.add("modal-open");

            const firstInput = el.querySelector(
                "input:not([type='hidden']), select, textarea, button"
            );

            if (firstInput) {
                setTimeout(() => firstInput.focus(), 50);
            }
        },

        closeModal(modal) {
            const el = typeof modal === "string"
                ? document.getElementById(modal)
                : modal;

            if (!el) {
                return;
            }

            el.classList.remove("show");
            el.setAttribute("aria-hidden", "true");

            if (!document.querySelector(".modal.show")) {
                document.body.classList.remove("modal-open");
            }
        },

        setupModals() {
            document.querySelectorAll("[data-modal-open]").forEach(button => {
                if (button.dataset.modalInitialized === "true") {
                    return;
                }

                button.dataset.modalInitialized = "true";

                button.addEventListener("click", () => {
                    const modalId = button.dataset.modalOpen;
                    this.openModal(modalId);
                });
            });

            document.querySelectorAll("[data-modal-close]").forEach(button => {
                if (button.dataset.modalInitialized === "true") {
                    return;
                }

                button.dataset.modalInitialized = "true";

                button.addEventListener("click", () => {
                    const modal = button.closest(".modal");

                    if (modal) {
                        this.closeModal(modal);
                    }
                });
            });

            document.querySelectorAll(".modal").forEach(modal => {
                if (modal.dataset.modalInitialized === "true") {
                    return;
                }

                modal.dataset.modalInitialized = "true";

                modal.addEventListener("click", event => {
                    if (event.target === modal) {
                        this.closeModal(modal);
                    }
                });
            });

            document.addEventListener("keydown", event => {
                if (event.key === "Escape") {
                    document.querySelectorAll(".modal.show").forEach(modal => {
                        this.closeModal(modal);
                    });
                }
            });
        },

        // ==========================================
        // IMAGE VIEWER
        // ==========================================
        setupImageViewer() {
            document.querySelectorAll("[data-image-viewer]").forEach(image => {
                if (image.dataset.viewerInitialized === "true") {
                    return;
                }

                image.dataset.viewerInitialized = "true";

                image.addEventListener("click", () => {
                    const imageUrl = image.dataset.imageViewer || image.src;

                    if (!this.isValidImageUrl(imageUrl)) {
                        return;
                    }

                    let viewer = document.getElementById("image-viewer");

                    if (!viewer) {
                        viewer = document.createElement("div");
                        viewer.id = "image-viewer";
                        viewer.className = "image-viewer";
                        viewer.setAttribute("role", "dialog");
                        viewer.setAttribute("aria-modal", "true");
                        viewer.setAttribute("aria-label", "बड़ी फोटो");

                        viewer.innerHTML = `
                            <button
                                type="button"
                                class="image-viewer-close"
                                aria-label="फोटो बंद करें"
                            >×</button>
                            <img alt="बड़ी फोटो">
                        `;

                        document.body.appendChild(viewer);

                        viewer.addEventListener("click", event => {
                            if (
                                event.target === viewer ||
                                event.target.closest(".image-viewer-close")
                            ) {
                                viewer.classList.remove("show");
                                document.body.classList.remove("modal-open");
                            }
                        });
                    }

                    const fullImage = viewer.querySelector("img");
                    fullImage.src = imageUrl;
                    fullImage.alt = image.alt || "बड़ी फोटो";

                    viewer.classList.add("show");
                    document.body.classList.add("modal-open");
                });
            });
        },

        // ==========================================
        // SAFE IMAGE DISPLAY
        // ==========================================
        setupImages() {
            document.querySelectorAll("img").forEach(image => {
                if (image.dataset.imageInitialized === "true") {
                    return;
                }

                image.dataset.imageInitialized = "true";

                image.addEventListener("error", () => {
                    image.classList.add("image-load-error");

                    // Do not repeatedly trigger errors by replacing src.
                    image.removeAttribute("src");
                });
            });
        },

        // ==========================================
        // INITIALIZE SHARED WEBSITE FEATURES
        // ==========================================
        init() {
            this.setupMenu();
            this.setupSocialLinks();
            this.setupModals();
            this.setupImageViewer();
            this.setupImages();
        }
    };

    // ==========================================
    // RUN AFTER HTML LOADS
    // ==========================================
    document.addEventListener("DOMContentLoaded", () => {
        window.App.init();
    });

})();
