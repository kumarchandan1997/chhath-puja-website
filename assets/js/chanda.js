(function () {
    "use strict";

    // ==================================================
    // CONFIGURATION
    // ==================================================

    const TABLE_NAME = "chanda_records";
    const STORAGE_BUCKET = window.STORAGE_BUCKET || "donor-images";
    const RECORDS_PER_PAGE = 10;
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

    // ==================================================
    // SUPABASE CONNECTION
    // ==================================================

    let db = null;

    if (
        window.supabase &&
        typeof window.supabase.createClient === "function" &&
        window.SUPABASE_URL &&
        window.SUPABASE_ANON_KEY
    ) {
        db = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );
    }

    // ==================================================
    // DOM ELEMENTS
    // ==================================================

    const donationList = document.getElementById("donation-list");
    const donationSummary = document.getElementById("donation-summary");
    const donationSearch = document.getElementById("donation-search");
    const donationPagination = document.getElementById(
        "donation-pagination"
    );

    const donationModal = document.getElementById("donation-modal");
    const donationForm = document.getElementById("donation-form");

    const openModalButton = document.getElementById(
        "open-donation-modal"
    );

    const closeModalButton = document.getElementById(
        "close-donation-modal"
    );

    const cancelModalButton = document.getElementById(
        "cancel-donation"
    );

    const saveDonationButton = document.getElementById("save-donation");

    const formMessage = document.getElementById(
        "donation-form-message"
    );

    const exportButton = document.getElementById("export-donations");

    const totalDonorsElement = document.getElementById("total-donors");
    const totalDonationElement = document.getElementById("total-donation");
    const highestDonationElement = document.getElementById(
        "highest-donation"
    );

    // ==================================================
    // PHOTO INPUT ELEMENTS
    // ==================================================

    const galleryInput = document.getElementById("donor-gallery-image");
    const cameraInput = document.getElementById("donor-camera-image");
    const imageInput = document.getElementById("donor-image");

    const imagePreview = document.getElementById("donor-image-preview");
    const removeImageButton = document.getElementById("remove-donor-image");

    // ==================================================
    // STATE
    // ==================================================

    let allDonations = [];
    let currentPage = 1;
    let searchTerm = "";
    let isSaving = false;
    let previewObjectUrl = null;

    // ==================================================
    // HELPERS
    // ==================================================

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[char];
        });
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat("hi-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function formatDate(value) {
        if (!value) {
            return "तारीख उपलब्ध नहीं";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "तारीख उपलब्ध नहीं";
        }

        return new Intl.DateTimeFormat("hi-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    function showToast(message) {
        const toast = document.getElementById("toast");

        if (!toast) {
            alert(message);
            return;
        }

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(showToast.timer);

        showToast.timer = setTimeout(function () {
            toast.classList.remove("show");
        }, 3500);
    }

    function showFormMessage(message, type) {
        if (!formMessage) {
            alert(message);
            return;
        }

        formMessage.className = type === "error"
            ? "donation-error"
            : "donation-success";

        formMessage.textContent = message;
        formMessage.style.display = "block";
    }

    function clearFormMessage() {
        if (!formMessage) return;

        formMessage.textContent = "";
        formMessage.className = "";
        formMessage.style.display = "none";
    }

    function getErrorMessage(error) {
        return error?.message || "कृपया दोबारा प्रयास करें।";
    }

    // ==================================================
    // PHOTO PREVIEW
    // ==================================================

    function clearImagePreview() {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }

        if (imagePreview) {
            imagePreview.innerHTML = "";
            imagePreview.style.display = "none";
        }

        if (imageInput) {
            imageInput.value = "";
        }

        if (galleryInput) {
            galleryInput.value = "";
        }

        if (cameraInput) {
            cameraInput.value = "";
        }
    }

    function handleSelectedImage(file) {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            showFormMessage("कृपया सही फोटो चुनें।", "error");
            clearImagePreview();
            return;
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (!allowedTypes.includes(file.type)) {
            showFormMessage(
                "केवल JPG, PNG, WEBP या GIF फोटो चुनें।",
                "error"
            );

            clearImagePreview();
            return;
        }

        if (file.size > MAX_IMAGE_SIZE) {
            showFormMessage(
                "फोटो का आकार 5 MB से कम होना चाहिए।",
                "error"
            );

            clearImagePreview();
            return;
        }

        // असली file को form में उपयोग होने वाले input में रखें।
        const transfer = new DataTransfer();
        transfer.items.add(file);

        if (imageInput) {
            imageInput.files = transfer.files;
        }

        // पिछला preview हटाएँ।
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
        }

        previewObjectUrl = URL.createObjectURL(file);

        if (imagePreview) {
            imagePreview.innerHTML = "";

            const img = document.createElement("img");
            img.src = previewObjectUrl;
            img.alt = "चंदा देने वाले की फोटो का preview";

            img.style.maxWidth = "180px";
            img.style.maxHeight = "180px";
            img.style.objectFit = "cover";
            img.style.borderRadius = "12px";

            imagePreview.appendChild(img);
            imagePreview.style.display = "block";
        }

        clearFormMessage();
    }

    if (galleryInput) {
        galleryInput.addEventListener("change", function () {
            const file = this.files?.[0];

            if (file) {
                handleSelectedImage(file);
            }
        });
    }

    if (cameraInput) {
        cameraInput.addEventListener("change", function () {
            const file = this.files?.[0];

            if (file) {
                handleSelectedImage(file);
            }
        });
    }

    if (removeImageButton) {
        removeImageButton.addEventListener("click", function () {
            clearImagePreview();
            clearFormMessage();
        });
    }

    // ==================================================
    // MODAL
    // ==================================================

    function openModal() {
        if (!donationModal) return;

        clearFormMessage();

        donationModal.classList.add("open");
        donationModal.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";

        const nameInput = donationForm?.elements.namedItem("name");

        setTimeout(function () {
            nameInput?.focus();
        }, 100);
    }

    function closeModal() {
        if (isSaving || !donationModal) return;

        donationModal.classList.remove("open");
        donationModal.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";

        donationForm?.reset();
        clearImagePreview();
        clearFormMessage();
    }

    openModalButton?.addEventListener("click", openModal);
    closeModalButton?.addEventListener("click", closeModal);
    cancelModalButton?.addEventListener("click", closeModal);

    donationModal?.addEventListener("click", function (event) {
        if (event.target === donationModal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (
            event.key === "Escape" &&
            donationModal?.classList.contains("open")
        ) {
            closeModal();
        }
    });

    // ==================================================
    // UPLOAD PHOTO TO SUPABASE STORAGE
    // ==================================================

    async function uploadDonationImage(file) {
        if (!file) return null;

        if (!db) {
            throw new Error("Supabase कनेक्शन उपलब्ध नहीं है।");
        }

        if (!file.type.startsWith("image/")) {
            throw new Error("कृपया केवल फोटो अपलोड करें।");
        }

        if (file.size > MAX_IMAGE_SIZE) {
            throw new Error("फोटो का आकार 5 MB से कम होना चाहिए।");
        }

        const extensionMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif"
        };

        const extension = extensionMap[file.type];

        if (!extension) {
            throw new Error("यह फोटो फ़ॉर्मेट समर्थित नहीं है।");
        }

        const uniqueId = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : Date.now() + "-" + Math.random().toString(36).slice(2);

        const filePath = "chanda/" + uniqueId + "." + extension;

        const { error: uploadError } = await db
            .storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type
            });

        if (uploadError) {
            throw uploadError;
        }

        const { data } = db
            .storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(filePath);

        return data.publicUrl;
    }

    // ==================================================
    // LOAD DONATIONS FROM SUPABASE
    // ==================================================

    async function fetchDonations() {
        if (!donationList) return;

        if (!db) {
            donationList.innerHTML = `
                <div class="donation-empty">
                    <h3>Supabase कनेक्शन सेट नहीं है</h3>
                    <p>अपनी config.js फ़ाइल जाँचें।</p>
                </div>
            `;

            if (donationSummary) {
                donationSummary.textContent =
                    "Supabase कनेक्शन उपलब्ध नहीं है।";
            }

            return;
        }

        donationList.innerHTML = `
            <div class="donation-loading">
                चंदा सूची लोड हो रही है...
            </div>
        `;

        try {
            const { data, error } = await db
                .from(TABLE_NAME)
                .select(
                    "id, name, mobile, address, amount, remarks, image_url, created_at"
                )
                .order("created_at", { ascending: false });

            if (error) throw error;

            allDonations = (data || []).sort(function (a, b) {
                return Number(b.amount || 0) - Number(a.amount || 0);
            });

            currentPage = 1;

            updateSummary();
            renderDonations();

        } catch (error) {
            console.error("Donation loading error:", error);

            donationList.innerHTML = `
                <div class="donation-empty">
                    <h3>रिकॉर्ड लोड नहीं हो सके</h3>
                    <p>${escapeHTML(getErrorMessage(error))}</p>
                    <button
                        type="button"
                        id="retry-donation-load"
                        class="btn btn-primary">
                        दोबारा प्रयास करें
                    </button>
                </div>
            `;

            document.getElementById("retry-donation-load")
                ?.addEventListener("click", fetchDonations);
        }
    }

    // ==================================================
    // SUMMARY
    // ==================================================

    function updateSummary() {
        const totalAmount = allDonations.reduce(function (sum, record) {
            return sum + Number(record.amount || 0);
        }, 0);

        const highestAmount = allDonations.length
            ? Math.max(
                ...allDonations.map(record => Number(record.amount || 0))
            )
            : 0;

        if (totalDonorsElement) {
            totalDonorsElement.textContent = allDonations.length;
        }

        if (totalDonationElement) {
            totalDonationElement.textContent = formatCurrency(totalAmount);
        }

        if (highestDonationElement) {
            highestDonationElement.textContent = formatCurrency(highestAmount);
        }
    }

    // ==================================================
    // SEARCH
    // ==================================================

    function getFilteredDonations() {
        if (!searchTerm) return allDonations;

        const query = searchTerm.toLowerCase();

        return allDonations.filter(function (record) {
            return [
                record.name,
                record.mobile,
                record.address,
                record.remarks,
                record.amount
            ].some(function (value) {
                return String(value ?? "").toLowerCase().includes(query);
            });
        });
    }

    donationSearch?.addEventListener("input", function () {
        searchTerm = this.value.trim();
        currentPage = 1;
        renderDonations();
    });

    // ==================================================
    // RENDER DONATION CARDS
    // ==================================================

    function renderDonations() {
        if (!donationList) return;

        const filtered = getFilteredDonations();

        const totalPages = Math.max(
            1,
            Math.ceil(filtered.length / RECORDS_PER_PAGE)
        );

        currentPage = Math.min(currentPage, totalPages);

        const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;

        const visibleRecords = filtered.slice(
            startIndex,
            startIndex + RECORDS_PER_PAGE
        );

        if (donationSummary) {
            donationSummary.textContent =
                `कुल ${filtered.length} रिकॉर्ड • पृष्ठ ${currentPage}/${totalPages}`;
        }

        if (filtered.length === 0) {
            donationList.innerHTML = `
                <div class="donation-empty">
                    <h3>कोई रिकॉर्ड नहीं मिला</h3>
                    <p>
                        ${searchTerm
                            ? "दूसरे नाम या शब्द से खोजें।"
                            : "पहला चंदा जोड़ने के लिए बटन पर क्लिक करें।"}
                    </p>
                </div>
            `;

            if (donationPagination) {
                donationPagination.innerHTML = "";
            }

            return;
        }

        donationList.innerHTML = visibleRecords.map(function (record, index) {
            const rank = startIndex + index + 1;

            const imageHTML = record.image_url
                ? `
                    <img
                        class="donation-image"
                        src="${escapeHTML(record.image_url)}"
                        alt="${escapeHTML(record.name)} की फोटो"
                        loading="lazy"
                        onerror="this.style.display='none'">
                  `
                : `
                    <div class="donation-image-placeholder">🙏</div>
                  `;

            return `
                <article class="donation-card">
                    ${imageHTML}

                    <div class="donation-card-body">
                        <div class="donation-card-top">
                            <h3>${escapeHTML(record.name)}</h3>
                            <span class="donation-rank">
                                ${rank === 1 ? "🏆 " : ""}#${rank}
                            </span>
                        </div>

                        <div class="donation-amount">
                            ${formatCurrency(record.amount)}
                        </div>

                        <p class="donation-info">
                            📍 ${escapeHTML(record.address || "पता उपलब्ध नहीं")}
                        </p>

                        <p class="donation-info">
                            📅 ${formatDate(record.created_at)}
                        </p>

                        <div
                            id="donation-details-${escapeHTML(record.id)}"
                            class="donation-details">

                            <p class="donation-info">
                                <strong>मोबाइल:</strong>
                                ${escapeHTML(record.mobile || "उपलब्ध नहीं")}
                            </p>

                            <p class="donation-info">
                                <strong>टिप्पणी:</strong>
                                ${escapeHTML(record.remarks || "कोई टिप्पणी नहीं")}
                            </p>
                        </div>

                        <button
                            type="button"
                            class="btn btn-secondary donation-more"
                            data-details-id="${escapeHTML(record.id)}"
                            aria-expanded="false">
                            अधिक जानकारी देखें
                        </button>
                    </div>
                </article>
            `;
        }).join("");

        renderPagination(filtered.length, totalPages);
    }

    // ==================================================
    // SHOW / HIDE DETAILS
    // ==================================================

    donationList?.addEventListener("click", function (event) {
        const button = event.target.closest("[data-details-id]");

        if (!button) return;

        const recordId = button.dataset.detailsId;

        const details = document.getElementById(
            "donation-details-" + recordId
        );

        if (!details) return;

        const isOpen = details.classList.toggle("open");

        button.setAttribute("aria-expanded", String(isOpen));

        button.textContent = isOpen
            ? "कम जानकारी दिखाएँ"
            : "अधिक जानकारी देखें";
    });

    // ==================================================
    // PAGINATION
    // ==================================================

    function renderPagination(totalRecords, totalPages) {
        if (!donationPagination) return;

        donationPagination.innerHTML = "";

        if (totalRecords <= RECORDS_PER_PAGE) return;

        function addButton(label, page, disabled, active) {
            const button = document.createElement("button");

            button.type = "button";
            button.textContent = label;
            button.disabled = disabled;

            if (active) {
                button.classList.add("active");
                button.setAttribute("aria-current", "page");
            }

            button.addEventListener("click", function () {
                currentPage = page;
                renderDonations();

                donationList?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });

            donationPagination.appendChild(button);
        }

        addButton("← पिछला", currentPage - 1, currentPage === 1, false);

        for (let page = 1; page <= totalPages; page++) {
            addButton(String(page), page, false, page === currentPage);
        }

        addButton(
            "अगला →",
            currentPage + 1,
            currentPage === totalPages,
            false
        );
    }

    // ==================================================
    // SAVE DONATION
    // ==================================================

    donationForm?.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (isSaving) return;

        if (!db) {
            showFormMessage(
                "Supabase कनेक्शन उपलब्ध नहीं है। config.js जाँचें।",
                "error"
            );
            return;
        }

        const formData = new FormData(donationForm);

        const name = String(formData.get("name") || "").trim();
        const mobile = String(formData.get("mobile") || "").trim();
        const address = String(formData.get("address") || "").trim();
        const remarks = String(formData.get("remarks") || "").trim();
        const amount = Number(formData.get("amount"));

        // Photo input का name="image" होना आवश्यक है।
        const imageFile = imageInput?.files?.[0] || null;

        if (!name) {
            showFormMessage("कृपया दानदाता का नाम भरें।", "error");
            return;
        }

        if (!Number.isFinite(amount) || amount < 1) {
            showFormMessage("चंदा राशि कम से कम ₹1 होनी चाहिए।", "error");
            return;
        }

        if (imageFile && imageFile.size > MAX_IMAGE_SIZE) {
            showFormMessage("फोटो का आकार 5 MB से कम होना चाहिए।", "error");
            return;
        }

        isSaving = true;

        if (saveDonationButton) {
            saveDonationButton.disabled = true;
            saveDonationButton.textContent = "सेव हो रहा है...";
        }

        try {
            let imageUrl = null;

            if (imageFile) {
                showFormMessage("फोटो अपलोड हो रही है...", "success");
                imageUrl = await uploadDonationImage(imageFile);
            }

            const newRecord = {
                name: name,
                mobile: mobile || null,
                address: address || null,
                amount: amount,
                remarks: remarks || null,
                image_url: imageUrl
            };

            const { data, error } = await db
                .from(TABLE_NAME)
                .insert([newRecord])
                .select(
                    "id, name, mobile, address, amount, remarks, image_url, created_at"
                )
                .single();

            if (error) throw error;

            allDonations.push(data);

            allDonations.sort(function (a, b) {
                return Number(b.amount || 0) - Number(a.amount || 0);
            });

            searchTerm = "";

            if (donationSearch) {
                donationSearch.value = "";
            }

            currentPage = 1;

            updateSummary();
            renderDonations();

            donationForm.reset();
            clearImagePreview();

            donationModal?.classList.remove("open");
            donationModal?.setAttribute("aria-hidden", "true");

            document.body.style.overflow = "";

            clearFormMessage();

            showToast("🙏 चंदा सफलतापूर्वक सेव हो गया!");

            await fetchDonations();

        } catch (error) {
            console.error("Donation save error:", error);

            showFormMessage(
                "चंदा सेव नहीं हो सका: " + getErrorMessage(error),
                "error"
            );

        } finally {
            isSaving = false;

            if (saveDonationButton) {
                saveDonationButton.disabled = false;
                saveDonationButton.textContent = "चंदा सेव करें";
            }
        }
    });

    // ==================================================
    // EXPORT DONATIONS AS JSON
    // ==================================================

    exportButton?.addEventListener("click", function () {
        const exportData = allDonations.map(function (record) {
            return {
                id: record.id,
                name: record.name,
                mobile: record.mobile,
                address: record.address,
                amount: Number(record.amount || 0),
                remarks: record.remarks,
                image_url: record.image_url,
                created_at: record.created_at
            };
        });

        const blob = new Blob(
            [JSON.stringify(exportData, null, 2)],
            { type: "application/json;charset=utf-8" }
        );

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = "chanda-records.json";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(downloadUrl);

        showToast("चंदा सूची JSON फ़ाइल डाउनलोड हो गई।");
    });

    // ==================================================
    // INITIALIZE
    // ==================================================

    fetchDonations();

    // Refresh list every 30 seconds.
    setInterval(function () {
        if (
            document.visibilityState === "visible" &&
            !isSaving
        ) {
            fetchDonations();
        }
    }, 30000);

})();