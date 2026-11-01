(function () {
    "use strict";

    // ==========================================
    // CONFIGURATION
    // ==========================================

    const TABLE_NAME = "chanda_records";
    const STORAGE_BUCKET = window.STORAGE_BUCKET || "donor-images";

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

    const saveDonationButton = document.getElementById(
        "save-donation"
    );

    const formMessage = document.getElementById(
        "donation-form-message"
    );

    const exportButton = document.getElementById(
        "export-donations"
    );

    const totalDonorsElement = document.getElementById("total-donors");
    const totalDonationElement = document.getElementById("total-donation");
    const highestDonationElement = document.getElementById(
        "highest-donation"
    );

    // ==========================================
    // STATE
    // ==========================================

    let allDonations = [];
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
        formMessage.className = type === "error"
            ? "donation-error"
            : "donation-success";

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
    // MODAL
    // ==========================================

    function openModal() {
        clearFormMessage();

        donationModal.classList.add("open");
        donationModal.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";

        const nameInput = donationForm.elements.namedItem("name");

        setTimeout(function () {
            if (nameInput) {
                nameInput.focus();
            }
        }, 100);
    }

    function closeModal() {
        if (isSaving) {
            return;
        }

        donationModal.classList.remove("open");
        donationModal.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";

        donationForm.reset();
        clearFormMessage();
    }

    openModalButton.addEventListener("click", openModal);

    closeModalButton.addEventListener("click", closeModal);

    cancelModalButton.addEventListener("click", closeModal);

    donationModal.addEventListener("click", function (event) {
        if (event.target === donationModal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (
            event.key === "Escape" &&
            donationModal.classList.contains("open")
        ) {
            closeModal();
        }
    });

    // ==========================================
    // IMAGE UPLOAD
    // ==========================================

    async function uploadDonationImage(file) {
        if (!file) {
            return null;
        }

        if (!file.type.startsWith("image/")) {
            throw new Error("कृपया केवल फोटो अपलोड करें।");
        }

        if (file.size > MAX_IMAGE_SIZE) {
            throw new Error("फोटो का आकार 5 MB से कम होना चाहिए।");
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
        ];

        if (!allowedTypes.includes(file.type)) {
            throw new Error(
                "केवल JPG, PNG, WEBP या GIF फोटो अपलोड करें।"
            );
        }

        const extensionMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif"
        };

        const extension = extensionMap[file.type];

        const randomPart = (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        )
            ? window.crypto.randomUUID()
            : Date.now() + "-" + Math.random().toString(36).slice(2);

        const filePath = "chanda/" + randomPart + "." + extension;

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

    // ==========================================
    // FETCH DONATIONS
    // ==========================================

    async function fetchDonations() {
        if (!db) {
            donationList.innerHTML = `
                <div class="donation-empty">
                    <span class="empty-icon">⚙️</span>
                    <h3>Supabase कनेक्शन सेट नहीं है</h3>
                    <p>
                        assets/js/config.js में Project URL और
                        Publishable Key सही तरीके से भरें।
                    </p>
                </div>
            `;

            donationSummary.textContent = "कनेक्शन उपलब्ध नहीं है।";

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
                .order("amount", {
                    ascending: false
                })
                .order("created_at", {
                    ascending: false
                });

            if (error) {
                throw error;
            }

            allDonations = data || [];

            // राशि के अनुसार सबसे अधिक चंदा पहले।
            allDonations.sort(function (a, b) {
                const amountDifference =
                    Number(b.amount || 0) - Number(a.amount || 0);

                if (amountDifference !== 0) {
                    return amountDifference;
                }

                return new Date(b.created_at || 0) -
                    new Date(a.created_at || 0);
            });

            currentPage = 1;

            updateSummary();
            renderDonations();

        } catch (error) {
            console.error("Donation loading error:", error);

            donationList.innerHTML = `
                <div class="donation-empty">
                    <span class="empty-icon">⚠️</span>
                    <h3>रिकॉर्ड लोड नहीं हो सके</h3>
                    <p>${escapeHTML(getErrorMessage(error))}</p>
                    <button
                        type="button"
                        class="btn btn-primary"
                        id="retry-donation-load">
                        दोबारा प्रयास करें
                    </button>
                </div>
            `;

            donationSummary.textContent = "डेटा लोड करने में समस्या हुई।";

            document.getElementById("retry-donation-load")
                ?.addEventListener("click", fetchDonations);
        }
    }

    // ==========================================
    // SUMMARY
    // ==========================================

    function updateSummary() {
        const totalAmount = allDonations.reduce(function (total, record) {
            return total + Number(record.amount || 0);
        }, 0);

        const highestAmount = allDonations.length
            ? Number(allDonations[0].amount || 0)
            : 0;

        totalDonorsElement.textContent = allDonations.length;

        totalDonationElement.textContent = formatCurrency(totalAmount);

        highestDonationElement.textContent = formatCurrency(highestAmount);
    }

    // ==========================================
    // SEARCH
    // ==========================================

    function getFilteredDonations() {
        if (!searchTerm) {
            return allDonations;
        }

        const query = searchTerm.toLocaleLowerCase("hi-IN");

        return allDonations.filter(function (record) {
            return [
                record.name,
                record.mobile,
                record.address,
                record.remarks,
                record.amount
            ].some(function (value) {
                return String(value ?? "")
                    .toLocaleLowerCase("hi-IN")
                    .includes(query);
            });
        });
    }

    donationSearch.addEventListener("input", function () {
        searchTerm = donationSearch.value.trim();
        currentPage = 1;

        renderDonations();
    });

    // ==========================================
    // RENDER DONATION CARDS
    // ==========================================

    function renderDonations() {
        const filtered = getFilteredDonations();

        const totalPages = Math.max(
            1,
            Math.ceil(filtered.length / RECORDS_PER_PAGE)
        );

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;

        const visibleRecords = filtered.slice(
            startIndex,
            startIndex + RECORDS_PER_PAGE
        );

        donationSummary.textContent =
            `कुल ${filtered.length} रिकॉर्ड • ` +
            `पृष्ठ ${currentPage} / ${totalPages}`;

        if (filtered.length === 0) {
            donationList.innerHTML = `
                <div class="donation-empty">
                    <span class="empty-icon">🙏</span>
                    <h3>कोई रिकॉर्ड नहीं मिला</h3>
                    <p>
                        ${searchTerm
                            ? "दूसरे नाम या शब्द से खोजें।"
                            : "पहला चंदा जोड़ने के लिए ऊपर दिए गए बटन पर क्लिक करें।"}
                    </p>
                </div>
            `;

            donationPagination.innerHTML = "";
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
                        referrerpolicy="no-referrer"
                        onerror="
                            this.style.display='none';
                            this.nextElementSibling.style.display='flex';
                        ">

                    <div
                        class="donation-image-placeholder"
                        style="display:none;">
                        🙏
                    </div>
                `
                : `
                    <div class="donation-image-placeholder">
                        🙏
                    </div>
                `;

            const address = record.address
                ? escapeHTML(record.address)
                : "पता उपलब्ध नहीं";

            const mobile = record.mobile
                ? escapeHTML(record.mobile)
                : "मोबाइल उपलब्ध नहीं";

            const remarks = record.remarks
                ? escapeHTML(record.remarks)
                : "कोई टिप्पणी नहीं";

            return `
                <article class="donation-card">

                    ${imageHTML}

                    <div class="donation-card-body">

                        <div class="donation-card-top">

                            <h3>
                                ${escapeHTML(record.name)}
                            </h3>

                            <span class="donation-rank">
                                ${rank === 1 ? "🏆 " : ""}
                                #${rank}
                            </span>

                        </div>

                        <div class="donation-amount">
                            ${formatCurrency(record.amount)}
                        </div>

                        <p class="donation-info">
                            📍 ${address}
                        </p>

                        <p class="donation-info">
                            📅 ${formatDate(record.created_at)}
                        </p>

                        <div
                            id="donation-details-${escapeHTML(record.id)}"
                            class="donation-details">

                            <p class="donation-info">
                                <strong>मोबाइल:</strong>
                                ${mobile}
                            </p>

                            <p class="donation-info">
                                <strong>टिप्पणी:</strong>
                                ${remarks}
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

    // ==========================================
    // SHOW MORE DETAILS
    // ==========================================

    donationList.addEventListener("click", function (event) {
        const button = event.target.closest("[data-details-id]");

        if (!button) {
            return;
        }

        const recordId = button.dataset.detailsId;

        const details = document.getElementById(
            "donation-details-" + recordId
        );

        if (!details) {
            return;
        }

        const isOpen = details.classList.toggle("open");

        button.setAttribute("aria-expanded", String(isOpen));

        button.textContent = isOpen
            ? "कम जानकारी दिखाएँ"
            : "अधिक जानकारी देखें";
    });

    // ==========================================
    // PAGINATION
    // ==========================================

    function renderPagination(totalRecords, totalPages) {
        donationPagination.innerHTML = "";

        if (totalRecords <= RECORDS_PER_PAGE) {
            return;
        }

        const previousButton = document.createElement("button");

        previousButton.type = "button";
        previousButton.textContent = "← पिछला";
        previousButton.disabled = currentPage === 1;

        previousButton.addEventListener("click", function () {
            if (currentPage > 1) {
                currentPage--;
                renderDonations();

                donationList.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });

        donationPagination.appendChild(previousButton);

        for (let page = 1; page <= totalPages; page++) {
            const pageButton = document.createElement("button");

            pageButton.type = "button";
            pageButton.textContent = page;

            if (page === currentPage) {
                pageButton.classList.add("active");
                pageButton.setAttribute("aria-current", "page");
            }

            pageButton.addEventListener("click", function () {
                currentPage = page;
                renderDonations();

                donationList.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });

            donationPagination.appendChild(pageButton);
        }

        const nextButton = document.createElement("button");

        nextButton.type = "button";
        nextButton.textContent = "अगला →";
        nextButton.disabled = currentPage === totalPages;

        nextButton.addEventListener("click", function () {
            if (currentPage < totalPages) {
                currentPage++;
                renderDonations();

                donationList.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        });

        donationPagination.appendChild(nextButton);
    }

    // ==========================================
    // SAVE DONATION
    // ==========================================

    donationForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (isSaving) {
            return;
        }

        if (!db) {
            showFormMessage(
                "Supabase कनेक्शन उपलब्ध नहीं है। config.js चेक करें।",
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

        const imageFile = formData.get("image");

        if (!name) {
            showFormMessage(
                "कृपया दानदाता का नाम भरें।",
                "error"
            );
            return;
        }

        if (!Number.isFinite(amount) || amount < 1) {
            showFormMessage(
                "चंदा राशि कम से कम ₹1 होनी चाहिए।",
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

        saveDonationButton.disabled = true;
        saveDonationButton.textContent = "सेव हो रहा है...";

        try {
            let imageUrl = null;

            if (
                imageFile &&
                imageFile instanceof File &&
                imageFile.size > 0
            ) {
                showFormMessage(
                    "फोटो अपलोड हो रही है...",
                    "success"
                );

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

            if (error) {
                throw error;
            }

            // नया रिकॉर्ड स्थानीय सूची में डालें।
            allDonations.push(data);

            // सबसे अधिक चंदा पहले।
            allDonations.sort(function (a, b) {
                const amountDifference =
                    Number(b.amount || 0) - Number(a.amount || 0);

                if (amountDifference !== 0) {
                    return amountDifference;
                }

                return new Date(b.created_at || 0) -
                    new Date(a.created_at || 0);
            });

            searchTerm = "";
            donationSearch.value = "";

            currentPage = 1;

            updateSummary();
            renderDonations();

            donationForm.reset();

            donationModal.classList.remove("open");
            donationModal.setAttribute("aria-hidden", "true");

            document.body.style.overflow = "";

            clearFormMessage();

            showToast("🙏 चंदा सफलतापूर्वक सेव हो गया!");

            // Supabase से दोबारा सूची लोड करें।
            // इससे सर्वर पर सेव हुए डेटा की पुष्टि भी होगी।
            await fetchDonations();

        } catch (error) {
            console.error("Donation save error:", error);

            showFormMessage(
                "चंदा सेव नहीं हो सका: " +
                getErrorMessage(error),
                "error"
            );

        } finally {
            isSaving = false;

            saveDonationButton.disabled = false;
            saveDonationButton.textContent = "चंदा सेव करें";
        }
    });

    // ==========================================
    // EXPORT JSON
    // ==========================================

    exportButton.addEventListener("click", function () {
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
            {
                type: "application/json;charset=utf-8"
            }
        );

        const downloadUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = downloadUrl;
        link.download = "chandanstore.json";

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(downloadUrl);

        showToast("चंदा सूची JSON फ़ाइल डाउनलोड हो गई।");
    });

    // ==========================================
    // INITIALIZE
    // ==========================================

    fetchDonations();

    // दूसरे मोबाइल या ब्राउज़र में जोड़े गए रिकॉर्ड
    // दिखाने के लिए समय-समय पर सूची अपडेट करें।
    setInterval(function () {
        if (
            document.visibilityState === "visible" &&
            !isSaving
        ) {
            fetchDonations();
        }
    }, 30000);

})();