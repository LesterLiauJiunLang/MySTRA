// =============================================
// PUBLIC FEEDBACK - GOVERNMENT ADMIN
// READ ONLY
// =============================================

let allFeedback = [];
let filteredFeedback = [];
let selectedFeedbackId = null;


document.addEventListener(
    "DOMContentLoaded",
    async function () {

        bindFeedbackEvents();

        await loadFeedback();

    }
);


// =============================================
// LOAD FROM SUPABASE
// =============================================

async function loadFeedback() {

    const list =
        document.getElementById(
            "feedback-list"
        );

    try {

        const client =
            window.supabaseClient;

        if (!client) {

            throw new Error(
                "Supabase client is not available."
            );

        }


        const {
            data,
            error
        } =
            await client
                .from("public_feedback")
                .select(`
                    id,
                    submitter_name,
                    description,
                    category,
                    created_at
                `)
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (error) {

            throw error;

        }


        allFeedback =
            data || [];


        filteredFeedback =
            [...allFeedback];


        renderFeedbackList();


        console.log(
            "✅ Loaded",
            allFeedback.length,
            "feedback record(s)"
        );

    }

    catch (error) {

        console.error(
            "❌ Feedback load error:",
            error
        );


        list.innerHTML = `
            <div
                style="
                    background:#FEE2E2;
                    color:#991B1B;
                    padding:15px;
                    border-radius:8px;
                "
            >
                ⚠️ Unable to load public feedback.
                <br><br>
                ${escapeHtml(error.message)}
            </div>
        `;

    }

}


// =============================================
// EVENTS
// =============================================

function bindFeedbackEvents() {

    document
        .getElementById(
            "feedback-search"
        )
        .addEventListener(
            "input",
            applyFeedbackFilters
        );


    document
        .getElementById(
            "feedback-category-filter"
        )
        .addEventListener(
            "change",
            applyFeedbackFilters
        );

}


// =============================================
// FILTER
// =============================================

function applyFeedbackFilters() {

    const search =
        document
            .getElementById(
                "feedback-search"
            )
            .value
            .trim()
            .toLowerCase();


    const category =
        document
            .getElementById(
                "feedback-category-filter"
            )
            .value;


    filteredFeedback =

        allFeedback.filter(

            feedback => {

                const name =
                    (
                        feedback.submitter_name ||
                        ""
                    )
                    .toLowerCase();


                const description =
                    (
                        feedback.description ||
                        ""
                    )
                    .toLowerCase();


                const feedbackCategory =
                    (
                        feedback.category ||
                        ""
                    )
                    .toLowerCase();


                const searchMatch =

                    !search ||

                    name.includes(search) ||

                    description.includes(search) ||

                    feedbackCategory.includes(
                        search
                    );


                const categoryMatch =

                    category === "ALL" ||

                    feedback.category ===
                    category;


                return (
                    searchMatch &&
                    categoryMatch
                );

            }

        );


    renderFeedbackList();

}


// =============================================
// RENDER LEFT LIST
// =============================================

function renderFeedbackList() {

    const list =
        document.getElementById(
            "feedback-list"
        );


    document
        .getElementById(
            "feedback-count"
        )
        .textContent =
            filteredFeedback.length;


    if (
        filteredFeedback.length === 0
    ) {

        list.innerHTML = `
            <div class="feedback-empty">
                📭
                <br><br>
                No feedback records found.
            </div>
        `;

        clearDetails();

        return;

    }


    list.innerHTML =

        filteredFeedback

            .map(

                feedback => `

                    <div
                        class="
                            gov-queue-item
                            ${
                                feedback.id ===
                                selectedFeedbackId

                                    ? "selected"

                                    : ""
                            }
                        "

                        data-feedback-id="
                            ${feedback.id}
                        "
                    >

                        <strong>
                            ${
                                escapeHtml(
                                    feedback.submitter_name
                                    || "Unknown"
                                )
                            }
                        </strong>

                        <br>

                        <span
                            class="category-badge"
                        >
                            ${
                                escapeHtml(
                                    formatCategory(
                                        feedback.category
                                    )
                                )
                            }
                        </span>


                        <div
                            class="feedback-preview"
                        >
                            ${
                                escapeHtml(
                                    shortenText(
                                        feedback.description,
                                        120
                                    )
                                )
                            }
                        </div>


                        <div
                            class="feedback-meta"
                        >
                            🕒
                            ${
                                formatDate(
                                    feedback.created_at
                                )
                            }
                        </div>

                    </div>

                `

            )

            .join("");


    document
        .querySelectorAll(
            ".gov-queue-item"
        )
        .forEach(

            item => {

                item.addEventListener(
                    "click",

                    function () {

                        const id =
                            this
                                .dataset
                                .feedbackId
                                .trim();


                        showFeedbackDetails(
                            id
                        );

                    }
                );

            }

        );

}


// =============================================
// SHOW DETAILS
// =============================================

function showFeedbackDetails(id) {

    const feedback =
        allFeedback.find(
            record =>
                record.id === id
        );


    if (!feedback) {

        return;

    }


    selectedFeedbackId =
        feedback.id;


    document
        .getElementById(
            "feedback-details"
        )
        .innerHTML = `

            <div class="feedback-detail-box">

                <label>
                    Submitted By
                </label>

                <div class="feedback-detail-value">
                    ${
                        escapeHtml(
                            feedback.submitter_name
                            || "Unknown"
                        )
                    }
                </div>

            </div>


            <div class="feedback-detail-box">

                <label>
                    Category
                </label>

                <div class="feedback-detail-value">
                    ${
                        escapeHtml(
                            formatCategory(
                                feedback.category
                            )
                        )
                    }
                </div>

            </div>


            <div class="feedback-detail-box">

                <label>
                    Description
                </label>

                <div class="feedback-detail-value">
                    ${
                        escapeHtml(
                            feedback.description
                            || "No description provided."
                        )
                    }
                </div>

            </div>


            <div class="feedback-detail-box">

                <label>
                    Submitted Date
                </label>

                <div class="feedback-detail-value">
                    ${
                        formatDate(
                            feedback.created_at
                        )
                    }
                </div>

            </div>

        `;


    renderFeedbackList();

}


// =============================================
// CLEAR DETAILS
// =============================================

function clearDetails() {

    selectedFeedbackId = null;


    document
        .getElementById(
            "feedback-details"
        )
        .innerHTML = `

            <div class="feedback-empty">

                📬

                <br><br>

                Select a feedback record
                to view its details.

            </div>

        `;

}


// =============================================
// CATEGORY LABEL
// =============================================

function formatCategory(category) {

    const categories = {

        complaint:
            "Complaint",

        suggestion:
            "Suggestion",

        "new-property":
            "New Property",

        bug:
            "Bug Report",

        inquiry:
            "General Inquiry",

        other:
            "Other"

    };


    return (
        categories[category] ||
        category ||
        "Other"
    );

}


// =============================================
// DATE
// =============================================

function formatDate(value) {

    if (!value) {

        return "-";

    }


    return new Date(
        value
    )
    .toLocaleString(
        "en-MY",
        {
            day:
                "2-digit",

            month:
                "short",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit"
        }
    );

}


// =============================================
// SHORT DESCRIPTION
// =============================================

function shortenText(
    text,
    maxLength
) {

    if (!text) {

        return "No description";

    }


    if (
        text.length <=
        maxLength
    ) {

        return text;

    }


    return (
        text.substring(
            0,
            maxLength
        )
        +
        "..."
    );

}


// =============================================
// ESCAPE HTML
// =============================================

function escapeHtml(value) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value || "";


    return div.innerHTML;

}
