(function () {
    "use strict";

    // ==========================================
    // CONFIGURATION
    // ==========================================

    const TABLE_NAME = "material_records";

    const STORAGE_BUCKET =
        window.STORAGE_BUCKET || "donor-images";

    const RECORDS_PER_PAGE = 10;

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

    // ==========================================
    // SUPABASE CONNECTION
    // ==========================================

    let db = null;

    if (
        window.supabase &&
        typeof window.supabase.createClient === "function" &&
        window.SUPABASE_URL &&
        window.SUPABASE_ANON_KEY &&
        !window.SUPABASE_URL.includes("PASTE_") &&
        !window.SUPABASE_ANON_KEY.includes("PASTE_")
    ) {
        db = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );
    }

    // ==========================================
    // DOM ELEMENTS
    // ==========================================

    const materialList =
        document.getElementById("material-list");

    const materialSummary =
        document.getElementById("material-summary");

    const materialSearch =
        document.getElementById("material-search");

    const materialPagination =
        document.getElementById("material-pagination");

    const materialModal =
        document.getElementById("material-modal");

    const materialForm =
        document.getElementById("material-form");

    const openModalButton =
        document.getElementById("open-material-modal");

    const closeModalButton =
        document.getElementById("close-material-modal");

    const cancelModalButton =
        document.getElementById("cancel-material");

    const saveButton =
        document.getElementById("save-material");

    const formMessage =
        document.getElementById("material-form-message");

    const balancePreview =
        document.getElementById("balance-preview");

    const exportButton =
        document.getElementById("export-materials");

    const totalCountElement =
        document.getElementById("material-total-count");

    const totalAmountElement =
        document.getElementById("material-total-amount");

    const totalBalanceElement =
        document.getElementById("material-total-balance");

    const imageViewer =
        document.getElementById("material-image-viewer");

    const fullImage =
        document.getElementById("material-full-image");

    const closeImageButton =
        document.getElementById("close-material-image");

    // ==========================================
    // STATE
    // ==========================================

    let allMaterials = [];

    let currentPage = 1;

    let searchTerm = "";

    let isSaving = false;

    // ==========================================
    // HELPERS
    // ==========================================

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

    function getBalance(record) {
        return Math.max(
            0,
            Number(record.total_amount || 0) -
            Number(record.advance_paid || 0)
        );
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
        formMessage.className =
            type === "error"
                ? "material-error"
                : "material-success";

        formMessage.textContent = message;

        formMessage.style.display = "block";
    }

    function clearFormMessage() {
        formMessage.textContent = "";
        formMessage.className = "";
        formMessage.style.display = "none";
    }

    function getErrorMessage(error) {
        if (!error) {
            return "अज्ञात त्रुटि हुई।";
        }

        return error.message || "कृपया दोबारा प्रयास करें।";
    }

    // ==========================================
    // MODAL OPEN / CLOSE
    // ==========================================

    function openModal() {
        clearFormMessage();

        materialModal.classList.add("open");

        materialModal.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.style.overflow = "hidden";

        setTimeout(function () {
            materialForm.elements
                .namedItem("material_name")
                ?.focus();
        }, 100);
    }

    function closeModal() {
        if (isSaving) {
            return;
        }

        materialModal.classList.remove("open");

        materialModal.setAttribute(
            "aria-hidden",
            "true"
        );

        document.body.style.overflow = "";

        materialForm.reset();

        clearFormMessage();

        updateBalancePreview();
    }

    openModalButton.addEventListener(
        "click",
        openModal
    );

    closeModalButton.addEventListener(
        "click",
        closeModal
    );

    cancelModalButton.addEventListener(
        "click",
        closeModal
    );

    materialModal.addEventListener("click", function (event) {
        if (event.target === materialModal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (
            event.key === "Escape" &&
            materialModal.classList.contains("open")
        ) {
            closeModal();
        }

        if (
            event.key === "Escape" &&
            imageViewer.classList.contains("open")
        ) {
            closeImageViewer();
        }
    });

    // ==========================================
    // PAYMENT CALCULATION
    // ==========================================

    const totalAmountInput =
        materialForm.elements.namedItem("total_amount");

    const advancePaidInput =
        materialForm.elements.namedItem("advance_paid");

    function updateBalancePreview() {
        const totalAmount = Math.max(
            0,
            Number(totalAmountInput.value) || 0
        );

        const advancePaid = Math.max(
            0,
            Number(advancePaidInput.value) || 0
        );

        const balance = Math.max(
            0,
            totalAmount - advancePaid
        );

        balancePreview.textContent =
            formatCurrency(balance);
    }

    totalAmountInput.addEventListener(
        "input",
        updateBalancePreview
    );

    advancePaidInput.addEventListener(
        "input",
        updateBalancePreview
    );

    // ==========================================
    // IMAGE UPLOAD
    // ==========================================

    async function uploadMaterialImage(file) {
        if (!file) {
            return null;
        }

        if (!file.type.startsWith("image/")) {
            throw new Error(
                "कृपया केवल image फ़ाइल चुनें।"
            );
        }

        if (file.size > MAX_IMAGE_SIZE) {
            throw new Error(
                "फोटो का आकार 5 MB से कम होना चाहिए।"
            );
        }

        /*
         * ब्राउज़र में उपलब्ध image formats स्वीकार करें।
         * कुछ formats Supabase/browser द्वारा समर्थित न होने पर
         * अपलोड या प्रदर्शन विफल हो सकता है।
         */

        const extensionMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/avif": "avif",
            "image/bmp": "bmp",
            "image/svg+xml": "svg",
            "image/tiff": "tif",
            "image/x-icon": "ico",
            "image/heic": "heic",
            "image/heif": "heif"
        };

        let extension =
            extensionMap[file.type.toLowerCase()];

        if (!extension) {
            const fileExtension =
                file.name.split(".").pop().toLowerCase();

            if (
                /^[a-z0-9]{2,5}$/.test(fileExtension)
            ) {
                extension = fileExtension;
            } else {
                extension = "img";
            }
        }

        const uniqueName =
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
                ? window.crypto.randomUUID()
                : Date.now() +
                    "-" +
                    Math.random().toString(36).slice(2);

        const filePath =
            "materials/" +
            uniqueName +
            "." +
            extension;

        const { error: uploadError } = await db
            .storage
            .from(STORAGE_BUCKET)
            .upload(filePath, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type || undefined
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

    // ==========================================
    // FETCH MATERIALS
    // ==========================================

    async function fetchMaterials() {
        if (!db) {
            materialList.innerHTML = `
                <div class="material-empty">
                    <span class="material-empty-icon">⚙️</span>

                    <h3>Supabase कनेक्शन सेट नहीं है</h3>

                    <p>
                        assets/js/config.js में Project URL और
                        Publishable Key सही तरीके से भरें।
                    </p>
                </div>
            `;

            materialSummary.textContent =
                "Supabase कनेक्शन उपलब्ध नहीं है।";

            return;
        }

        materialList.innerHTML = `
            <div class="material-loading">
                सामग्री रिकॉर्ड लोड हो रहे हैं...
            </div>
        `;

        try {
            const { data, error } = await db
                .from(TABLE_NAME)
                .select(
                    "id, material_name, description, details_description, image_url, advance_paid, total_amount, created_at"
                )
                .order("created_at", {
                    ascending: false
                });

            if (error) {
                throw error;
            }

            allMaterials = data || [];

            updateSummary();

            renderMaterials();

        } catch (error) {
            console.error(
                "Material loading error:",
                error
            );

            materialList.innerHTML = `
                <div class="material-empty">
                    <span class="material-empty-icon">⚠️</span>

                    <h3>सामग्री लोड नहीं हो सकी</h3>

                    <p>
                        ${escapeHTML(getErrorMessage(error))}
                    </p>

                    <button
                        id="retry-material-load"
                        class="btn btn-primary"
                        type="button">
                        दोबारा प्रयास करें
                    </button>
                </div>
            `;

            materialSummary.textContent =
                "रिकॉर्ड लोड करने में समस्या हुई।";

            document
                .getElementById("retry-material-load")
                ?.addEventListener(
                    "click",
                    fetchMaterials
                );
        }
    }

    // ==========================================
    // SUMMARY
    // ==========================================

    function updateSummary() {
        const totalAmount = allMaterials.reduce(
            function (sum, record) {
                return sum +
                    Number(record.total_amount || 0);
            },
            0
        );

        const totalBalance = allMaterials.reduce(
            function (sum, record) {
                return sum + getBalance(record);
            },
            0
        );

        totalCountElement.textContent =
            allMaterials.length;

        totalAmountElement.textContent =
            formatCurrency(totalAmount);

        totalBalanceElement.textContent =
            formatCurrency(totalBalance);
    }

    // ==========================================
    // SEARCH
    // ==========================================

    function getFilteredMaterials() {
        if (!searchTerm) {
            return allMaterials;
        }

        const query =
            searchTerm.toLocaleLowerCase("hi-IN");

        return allMaterials.filter(function (record) {
            return [
                record.material_name,
                record.description,
                record.details_description,
                record.total_amount,
                record.advance_paid
            ].some(function (value) {
                return String(value ?? "")
                    .toLocaleLowerCase("hi-IN")
                    .includes(query);
            });
        });
    }

    materialSearch.addEventListener(
        "input",
        function () {
            searchTerm = materialSearch.value.trim();

            currentPage = 1;

            renderMaterials();
        }
    );

    // ==========================================
    // RENDER MATERIAL CARDS
    // ==========================================

    function renderMaterials() {
        const filtered = getFilteredMaterials();

        const totalPages = Math.max(
            1,
            Math.ceil(
                filtered.length / RECORDS_PER_PAGE
            )
        );

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const startIndex =
            (currentPage - 1) * RECORDS_PER_PAGE;

        const visibleRecords = filtered.slice(
            startIndex,
            startIndex + RECORDS_PER_PAGE
        );

        materialSummary.textContent =
            `कुल ${filtered.length} रिकॉर्ड • ` +
            `पृष्ठ ${currentPage} / ${totalPages}`;

        if (filtered.length === 0) {
            materialList.innerHTML = `
                <div class="material-empty">
                    <span class="material-empty-icon">🪔</span>

                    <h3>कोई सामग्री रिकॉर्ड नहीं मिला</h3>

                    <p>
                        ${
                            searchTerm
                                ? "दूसरे नाम या शब्द से खोजें।"
                                : "नई सामग्री जोड़ने के लिए ऊपर दिए गए बटन पर क्लिक करें।"
                        }
                    </p>
                </div>
            `;

            materialPagination.innerHTML = "";

            return;
        }

        materialList.innerHTML =
            visibleRecords.map(function (record, index) {
                const number =
                    startIndex + index + 1;

                const totalAmount =
                    Number(record.total_amount || 0);

                const advancePaid =
                    Number(record.advance_paid || 0);

                const balance =
                    getBalance(record);

                let imageHTML;

                if (record.image_url) {
                    imageHTML = `
                        <div class="material-image-wrapper">

                            <img
                                class="material-image"
                                src="${escapeHTML(record.image_url)}"
                                alt="${escapeHTML(record.material_name)} की फोटो"
                                loading="lazy"
                                data-full-image="${escapeHTML(record.image_url)}"
                                onerror="
                                    this.parentElement.innerHTML =
                                        '<div class=&quot;material-image-placeholder&quot;>🪔</div>';
                                ">

                        </div>
                    `;
                } else {
                    imageHTML = `
                        <div class="material-image-placeholder">
                            🪔
                        </div>
                    `;
                }

                const descriptionHTML =
                    record.description
                        ? `
                            <p class="material-description">
                                ${escapeHTML(record.description)}
                            </p>
                        `
                        : "";

                const detailsHTML =
                    record.details_description
                        ? escapeHTML(
                            record.details_description
                        )
                        : "अतिरिक्त विवरण उपलब्ध नहीं है।";

                return `
                    <article class="material-card">

                        ${imageHTML}

                        <div class="material-card-body">

                            <div class="material-card-header">

                                <h3>
                                    ${escapeHTML(record.material_name)}
                                </h3>

                                <span class="material-number">
                                    #${number}
                                </span>

                            </div>

                            ${descriptionHTML}

                            <div class="material-payment-box">

                                <div class="material-payment-item">

                                    <span>कुल रकम</span>

                                    <strong>
                                        ${formatCurrency(totalAmount)}
                                    </strong>

                                </div>

                                <div class="material-payment-item">

                                    <span>अग्रिम भुगतान</span>

                                    <strong>
                                        ${formatCurrency(advancePaid)}
                                    </strong>

                                </div>

                                <div class="material-payment-item balance">

                                    <span>बाकी भुगतान</span>

                                    <strong>
                                        ${formatCurrency(balance)}
                                    </strong>

                                </div>

                            </div>

                            <div
                                id="material-details-${escapeHTML(record.id)}"
                                class="material-card-details">

                                <p class="material-description">
                                    <strong>विस्तृत विवरण:</strong><br>
                                    ${detailsHTML}
                                </p>

                                <p class="material-description">
                                    <strong>जोड़ने की तारीख:</strong><br>
                                    ${formatDate(record.created_at)}
                                </p>

                            </div>

                            <button
                                type="button"
                                class="btn btn-secondary material-more-button"
                                data-details-id="${escapeHTML(record.id)}"
                                aria-expanded="false">

                                अधिक जानकारी देखें

                            </button>

                        </div>

                    </article>
                `;
            }).join("");

        renderPagination(
            filtered.length,
            totalPages
        );
    }

    // ==========================================
    // FULL IMAGE VIEWER
    // ==========================================

    materialList.addEventListener(
        "click",
        function (event) {
            const image =
                event.target.closest("[data-full-image]");

            if (!image) {
                return;
            }

            openImageViewer(
                image.dataset.fullImage,
                image.alt
            );
        }
    );

    function openImageViewer(url, altText) {
        fullImage.src = url;

        fullImage.alt =
            altText || "सामग्री की पूरी फोटो";

        imageViewer.classList.add("open");

        imageViewer.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.style.overflow = "hidden";
    }

    function closeImageViewer() {
        imageViewer.classList.remove("open");

        imageViewer.setAttribute(
            "aria-hidden",
            "true"
        );

        fullImage.src = "";

        document.body.style.overflow = "";
    }

    closeImageButton.addEventListener(
        "click",
        closeImageViewer
    );

    imageViewer.addEventListener(
        "click",
        function (event) {
            if (event.target === imageViewer) {
                closeImageViewer();
            }
        }
    );

    fullImage.addEventListener(
        "error",
        function () {
            showToast(
                "पूरी फोटो लोड नहीं हो सकी।"
            );

            closeImageViewer();
        }
    );

    // ==========================================
    // SHOW MORE DETAILS
    // ==========================================

    materialList.addEventListener(
        "click",
        function (event) {
            const button =
                event.target.closest("[data-details-id]");

            if (!button) {
                return;
            }

            const id = button.dataset.detailsId;

            const details = document.getElementById(
                "material-details-" + id
            );

            if (!details) {
                return;
            }

            const isOpen =
                details.classList.toggle("open");

            button.setAttribute(
                "aria-expanded",
                String(isOpen)
            );

            button.textContent = isOpen
                ? "कम जानकारी दिखाएँ"
                : "अधिक जानकारी देखें";
        }
    );

    // ==========================================
    // PAGINATION
    // ==========================================

    function renderPagination(
        totalRecords,
        totalPages
    ) {
        materialPagination.innerHTML = "";

        if (totalRecords <= RECORDS_PER_PAGE) {
            return;
        }

        const previousButton =
            document.createElement("button");

        previousButton.type = "button";

        previousButton.textContent = "← पिछला";

        previousButton.disabled =
            currentPage === 1;

        previousButton.addEventListener(
            "click",
            function () {
                if (currentPage > 1) {
                    currentPage--;

                    renderMaterials();

                    materialList.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            }
        );

        materialPagination.appendChild(
            previousButton
        );

        for (
            let page = 1;
            page <= totalPages;
            page++
        ) {
            const pageButton =
                document.createElement("button");

            pageButton.type = "button";

            pageButton.textContent = page;

            if (page === currentPage) {
                pageButton.classList.add("active");

                pageButton.setAttribute(
                    "aria-current",
                    "page"
                );
            }

            pageButton.addEventListener(
                "click",
                function () {
                    currentPage = page;

                    renderMaterials();

                    materialList.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            );

            materialPagination.appendChild(
                pageButton
            );
        }

        const nextButton =
            document.createElement("button");

        nextButton.type = "button";

        nextButton.textContent = "अगला →";

        nextButton.disabled =
            currentPage === totalPages;

        nextButton.addEventListener(
            "click",
            function () {
                if (currentPage < totalPages) {
                    currentPage++;

                    renderMaterials();

                    materialList.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }
            }
        );

        materialPagination.appendChild(
            nextButton
        );
    }

    // ==========================================
    // SAVE MATERIAL
    // ==========================================

    materialForm.addEventListener(
        "submit",
        async function (event) {
            event.preventDefault();

            if (isSaving) {
                return;
            }

            if (!db) {
                showFormMessage(
                    "Supabase कनेक्शन उपलब्ध नहीं है। config.js जाँचें।",
                    "error"
                );

                return;
            }

            const formData =
                new FormData(materialForm);

            const materialName = String(
                formData.get("material_name") || ""
            ).trim();

            const description = String(
                formData.get("description") || ""
            ).trim();

            const detailsDescription = String(
                formData.get("details_description") || ""
            ).trim();

            const totalAmount = Number(
                formData.get("total_amount")
            );

            const advancePaidRaw = String(
                formData.get("advance_paid") ?? ""
            ).trim();

            const advancePaid =
                advancePaidRaw === ""
                    ? 0
                    : Number(advancePaidRaw);

            const imageFile =
                formData.get("image");

            if (!materialName) {
                showFormMessage(
                    "कृपया सामग्री का नाम भरें।",
                    "error"
                );

                return;
            }

            if (
                !Number.isFinite(totalAmount) ||
                totalAmount < 0
            ) {
                showFormMessage(
                    "कृपया सही कुल रकम भरें।",
                    "error"
                );

                return;
            }

            if (
                !Number.isFinite(advancePaid) ||
                advancePaid < 0
            ) {
                showFormMessage(
                    "अग्रिम भुगतान शून्य या उससे अधिक होना चाहिए।",
                    "error"
                );

                return;
            }

            if (advancePaid > totalAmount) {
                showFormMessage(
                    "अग्रिम भुगतान कुल रकम से अधिक नहीं हो सकता।",
                    "error"
                );

                return;
            }

            if (
                imageFile &&
                imageFile instanceof File &&
                imageFile.size > MAX_IMAGE_SIZE
            ) {
                showFormMessage(
                    "फोटो का आकार 5 MB से कम होना चाहिए।",
                    "error"
                );

                return;
            }

            isSaving = true;

            saveButton.disabled = true;

            saveButton.textContent =
                "सेव हो रहा है...";

            try {
                let imageUrl = null;

                if (
                    imageFile &&
                    imageFile instanceof File &&
                    imageFile.size > 0
                ) {
                    showFormMessage(
                        "सामग्री की फोटो अपलोड हो रही है...",
                        "success"
                    );

                    imageUrl =
                        await uploadMaterialImage(
                            imageFile
                        );
                }

                const newRecord = {
                    material_name: materialName,

                    description:
                        description || null,

                    details_description:
                        detailsDescription || null,

                    image_url:
                        imageUrl,

                    advance_paid:
                        advancePaid,

                    total_amount:
                        totalAmount
                };

                const { data, error } = await db
                    .from(TABLE_NAME)
                    .insert([newRecord])
                    .select(
                        "id, material_name, description, details_description, image_url, advance_paid, total_amount, created_at"
                    )
                    .single();

                if (error) {
                    throw error;
                }

                allMaterials.unshift(data);

                searchTerm = "";

                materialSearch.value = "";

                currentPage = 1;

                updateSummary();

                renderMaterials();

                materialForm.reset();

                updateBalancePreview();

                materialModal.classList.remove("open");

                materialModal.setAttribute(
                    "aria-hidden",
                    "true"
                );

                document.body.style.overflow = "";

                clearFormMessage();

                showToast(
                    "🪔 सामग्री सफलतापूर्वक सेव हो गई!"
                );

                // सर्वर से ताज़ा डेटा प्राप्त करें।
                await fetchMaterials();

            } catch (error) {
                console.error(
                    "Material save error:",
                    error
                );

                showFormMessage(
                    "सामग्री सेव नहीं हो सकी: " +
                    getErrorMessage(error),
                    "error"
                );

            } finally {
                isSaving = false;

                saveButton.disabled = false;

                saveButton.textContent =
                    "सामग्री सेव करें";
            }
        }
    );

    // ==========================================
    // EXPORT JSON
    // ==========================================

    exportButton.addEventListener(
        "click",
        function () {
            const exportData =
                allMaterials.map(function (record) {
                    return {
                        id: record.id,

                        material_name:
                            record.material_name,

                        description:
                            record.description,

                        details_description:
                            record.details_description,

                        image_url:
                            record.image_url,

                        advance_paid:
                            Number(record.advance_paid || 0),

                        total_amount:
                            Number(record.total_amount || 0),

                        balance:
                            getBalance(record),

                        created_at:
                            record.created_at
                    };
                });

            const blob = new Blob(
                [
                    JSON.stringify(
                        exportData,
                        null,
                        2
                    )
                ],
                {
                    type: "application/json;charset=utf-8"
                }
            );

            const downloadUrl =
                URL.createObjectURL(blob);

            const link =
                document.createElement("a");

            link.href = downloadUrl;

            link.download =
                "chhath-materials.json";

            document.body.appendChild(link);

            link.click();

            link.remove();

            setTimeout(function () {
                URL.revokeObjectURL(downloadUrl);
            }, 1000);

            showToast(
                "सामग्री की JSON फ़ाइल डाउनलोड हो गई।"
            );
        }
    );

    // ==========================================
    // INITIALIZE
    // ==========================================

    updateBalancePreview();

    fetchMaterials();

    // दूसरे डिवाइस पर जोड़े गए रिकॉर्ड समय-समय पर लोड करें।
    setInterval(function () {
        if (
            document.visibilityState === "visible" &&
            !isSaving
        ) {
            fetchMaterials();
        }
    }, 30000);

})();

// ==========================================
// ADMIN LOGIN SESSION - MATERIAL BUTTON
// ==========================================

(function () {
    "use strict";

    const ADMIN_SESSION_KEY = "chhath_admin_mobile";

    const materialButton = document.getElementById(
        "open-material-modal"
    );

    if (!materialButton) {
        return;
    }

    // ==========================================
    // SHOW / HIDE MATERIAL BUTTON
    // ==========================================

    function updateMaterialButton(isLoggedIn) {
        materialButton.style.display = isLoggedIn
            ? "inline-flex"
            : "none";

        materialButton.disabled = !isLoggedIn;

        materialButton.setAttribute(
            "aria-hidden",
            String(!isLoggedIn)
        );
    }

    // ==========================================
    // CHECK AUTHORIZATION RESPONSE
    // ==========================================

    function isAuthorizedResponse(data) {
        return (
            data === true ||
            data === "true" ||
            (
                Array.isArray(data) &&
                data.length > 0 &&
                (
                    data[0] === true ||
                    data[0] === "true" ||
                    data[0]?.check_authorized_mobile === true ||
                    data[0]?.check_authorized_mobile === "true"
                )
            )
        );
    }

    // ==========================================
    // GET SUPABASE CLIENT
    // ==========================================

    function getAuthClient() {
        // First, use the existing database client.
        if (
            window.db &&
            typeof window.db.rpc === "function"
        ) {
            return window.db;
        }

        // Otherwise, use the existing Supabase client.
        if (
            window.supabaseClient &&
            typeof window.supabaseClient.rpc === "function"
        ) {
            return window.supabaseClient;
        }

        // If necessary, create a new Supabase client.
        if (
            window.supabase &&
            typeof window.supabase.createClient === "function" &&
            window.SUPABASE_URL &&
            window.SUPABASE_ANON_KEY &&
            !String(window.SUPABASE_URL).includes("PASTE_") &&
            !String(window.SUPABASE_ANON_KEY).includes("PASTE_")
        ) {
            window.supabaseClient =
                window.supabase.createClient(
                    window.SUPABASE_URL,
                    window.SUPABASE_ANON_KEY
                );

            return window.supabaseClient;
        }

        return null;
    }

    // ==========================================
    // VERIFY ADMIN LOGIN
    // ==========================================

    let checkingSession = false;

    async function checkAdminSession() {
        if (checkingSession) {
            return;
        }

        const mobile = sessionStorage.getItem(
            ADMIN_SESSION_KEY
        );

        // If no valid mobile number is saved, hide the button.
        if (
            !mobile ||
            !/^[0-9]{10}$/.test(mobile)
        ) {
            updateMaterialButton(false);
            return;
        }

        const client = getAuthClient();

        // Hide the button if Supabase is not configured.
        if (
            !client ||
            typeof client.rpc !== "function"
        ) {
            console.error(
                "Admin button: Supabase client/config not found. " +
                "Please check assets/js/config.js."
            );

            updateMaterialButton(false);
            return;
        }

        checkingSession = true;

        try {
            // Verify the mobile number against the authorized list.
            const { data, error } = await client.rpc(
                "check_authorized_mobile",
                {
                    input_mobile: mobile
                }
            );

            if (error) {
                throw error;
            }

            const authorized =
                isAuthorizedResponse(data);

            // Show the button only for an authorized admin.
            updateMaterialButton(authorized);

            // Remove the saved mobile number if unauthorized.
            if (!authorized) {
                sessionStorage.removeItem(
                    ADMIN_SESSION_KEY
                );
            }

        } catch (error) {
            console.error(
                "Admin session check failed:",
                error
            );

            updateMaterialButton(false);

        } finally {
            checkingSession = false;
        }
    }

    // ==========================================
    // LISTEN FOR LOGIN / LOGOUT EVENTS
    // ==========================================

    window.addEventListener(
        "chhath-admin-login-changed",
        function (event) {
            if (event.detail?.loggedIn === true) {
                checkAdminSession();

            } else if (
                event.detail?.loggedIn === false
            ) {
                sessionStorage.removeItem(
                    ADMIN_SESSION_KEY
                );

                updateMaterialButton(false);
            }
        }
    );

    // ==========================================
    // INITIAL CHECK
    // ==========================================

    // Keep the button hidden until authorization is verified.
    updateMaterialButton(false);

    // Check the saved admin session when the page loads.
    checkAdminSession();

    // Verify again when the browser tab becomes active.
    document.addEventListener(
        "visibilitychange",
        function () {
            if (
                document.visibilityState === "visible"
            ) {
                checkAdminSession();
            }
        }
    );

})();