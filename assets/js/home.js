
document.addEventListener("DOMContentLoaded", async () => {
    "use strict";

    // ==========================================
    // CHECK SUPABASE CONNECTION
    // ==========================================
    if (!App.ready()) {
        return;
    }

    const totalDonationsEl = document.getElementById("total-donations");
    const materialCountEl = document.getElementById("material-count");
    const donorCountEl = document.getElementById("donor-count");
    const topDonorsEl = document.getElementById("top-donors");

    if (!topDonorsEl) {
        console.error('Element "#top-donors" not found.');
        return;
    }

    let isRefreshing = false;

    // ==========================================
    // IMAGE PLACEHOLDER
    // ==========================================
    function imagePlaceholder() {
        return `
            <div class="donor-image-placeholder">
                <span aria-hidden="true">🙏</span>
                <small>फोटो उपलब्ध नहीं</small>
            </div>
        `;
    }

    // ==========================================
    // GET DONOR IMAGE URL
    // ==========================================
    function getDonorImage(donor) {
        /*
         * IMPORTANT:
         * Update these field names if your database
         * uses a different image column.
         */
        const possibleFields = [
            "image_url",
            "photo_url",
            "image",
            "photo",
            "donor_image",
            "donor_image_url"
        ];

        for (const field of possibleFields) {
            const value = donor[field];

            if (
                typeof value === "string" &&
                value.trim() !== ""
            ) {
                try {
                    const url = new URL(
                        value.trim(),
                        window.location.href
                    );

                    if (
                        url.protocol === "https:" ||
                        url.protocol === "http:"
                    ) {
                        return url.href;
                    }
                } catch (error) {
                    console.warn(
                        `Invalid image URL in field "${field}".`
                    );
                }
            }
        }

        return "";
    }

    // ==========================================
    // RENDER DONOR IMAGE
    // ==========================================
    function renderDonorImage(donor) {
        const imageUrl = getDonorImage(donor);

        if (!imageUrl) {
            return imagePlaceholder();
        }

        return `
            <div class="donor-image-wrapper">
                <img
                    class="donor-image"
                    src="${App.escape(imageUrl)}"
                    alt="${App.escape(donor.name || "दानदाता")}"
                    loading="lazy"
                    decoding="async"
                >
            </div>
        `;
    }

    // ==========================================
    // DONOR IMAGE ERROR HANDLING
    // ==========================================
    function setupDonorImageErrors() {
        topDonorsEl
            .querySelectorAll(".donor-image")
            .forEach(image => {
                image.addEventListener("error", () => {
                    const wrapper = image.closest(
                        ".donor-image-wrapper"
                    );

                    if (wrapper) {
                        wrapper.outerHTML = imagePlaceholder();
                    }
                }, { once: true });
            });
    }

    // ==========================================
    // BUILD DONOR CARD
    // ==========================================
    function renderDonorCard(donor, index) {
        const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

        return `
            <article class="donor-card">

                <div class="donor-rank">
                    <span class="rank" aria-label="रैंक ${index + 1}">
                        ${medals[index] || index + 1}
                    </span>
                </div>

                ${renderDonorImage(donor)}

                <div class="donor-details">

                    <h3>
                        ${App.escape(donor.name || "अज्ञात दानदाता")}
                    </h3>

                    <p class="donor-message">
                        दान के लिए हार्दिक धन्यवाद
                    </p>

                    <strong class="donation-amount">
                        ${App.money(donor.amount)}
                    </strong>

                </div>

            </article>
        `;
    }

    // ==========================================
    // RENDER TOP 5 DONORS
    // ==========================================
    function renderTopDonors(donations) {
        /*
         * Group donations by donor name.
         * Multiple donations by the same name
         * are combined into one total.
         */
        const donorTotals = new Map();

        donations.forEach(item => {
            const name = String(
                item.name || "अज्ञात दानदाता"
            ).trim();

            const key = name.toLocaleLowerCase("hi-IN");

            if (!donorTotals.has(key)) {
                donorTotals.set(key, {
                    name: name,
                    amount: 0,
                    image: ""
                });
            }

            const donor = donorTotals.get(key);

            donor.amount += Number(item.amount || 0);

            // Use the first available image for this donor.
            const imageUrl = getDonorImage(item);

            if (!donor.image && imageUrl) {
                donor.image = imageUrl;
            }
        });

        const topDonors = [...donorTotals.values()]
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5)
            .map(donor => ({
                ...donor,

                /*
                 * Pass the selected image to the renderer.
                 */
                image_url: donor.image
            }));

        if (topDonors.length === 0) {
            topDonorsEl.innerHTML = `
                <div class="empty-state">
                    अभी तक कोई चंदा रिकॉर्ड नहीं जोड़ा गया है।
                </div>
            `;

            return;
        }

        topDonorsEl.innerHTML = topDonors
            .map((donor, index) => renderDonorCard(donor, index))
            .join("");

        setupDonorImageErrors();
    }

    // ==========================================
    // REFRESH HOMEPAGE DATA
    // ==========================================
    async function refresh() {
        if (isRefreshing) {
            return;
        }

        isRefreshing = true;

        try {
            const [donations, materials] = await Promise.all([
                App.loadDonations(),
                App.loadMaterials()
            ]);

            // ------------------------------
            // TOTAL DONATIONS
            // ------------------------------
            const total = donations.reduce(
                (sum, item) => sum + Number(item.amount || 0),
                0
            );

            if (totalDonationsEl) {
                totalDonationsEl.textContent = App.money(total);
            }

            // ------------------------------
            // MATERIAL COUNT
            // ------------------------------
            if (materialCountEl) {
                materialCountEl.textContent =
                    materials.length.toLocaleString("hi-IN");
            }

            // ------------------------------
            // UNIQUE DONOR COUNT
            // ------------------------------
            const uniqueDonors = new Set(
                donations.map(item =>
                    String(item.name || "अज्ञात दानदाता")
                        .trim()
                        .toLocaleLowerCase("hi-IN")
                )
            );

            if (donorCountEl) {
                donorCountEl.textContent =
                    uniqueDonors.size.toLocaleString("hi-IN");
            }

            // ------------------------------
            // TOP 5 DONORS
            // ------------------------------
            renderTopDonors(donations);

        } catch (error) {
            console.error("Homepage refresh error:", error);

            App.toast(
                error.message || "डेटा लोड नहीं हो सका।",
                true
            );

            if (!topDonorsEl.children.length) {
                topDonorsEl.innerHTML = `
                    <div class="empty-state">
                        डेटा लोड नहीं हो सका।
                        Supabase सेटिंग और SQL की जाँच करें।
                    </div>
                `;
            }

        } finally {
            isRefreshing = false;
        }
    }

    // ==========================================
    // INITIAL LOAD
    // ==========================================
    await refresh();

    // ==========================================
    // AUTOMATIC REFRESH EVERY 30 SECONDS
    // ==========================================
    setInterval(refresh, 30000);

    // ==========================================
    // SUPABASE REAL-TIME UPDATES
    // ==========================================
    try {
        await App.subscribe("chanda_records", refresh);
        await App.subscribe("material_records", refresh);
    } catch (error) {
        console.warn(
            "Real-time updates unavailable. Automatic refresh is still enabled.",
            error
        );
    }
});
