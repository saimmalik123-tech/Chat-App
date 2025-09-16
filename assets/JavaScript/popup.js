export function showPopup(message) {
    const popup = document.getElementById("popup");
    const messageEl = document.getElementById("popup-message");
    const closeBtn = document.getElementById("popup-close");

    if (!popup || !messageEl) return;

    messageEl.textContent = message;
    popup.classList.remove("hidden");

    closeBtn.onclick = () => popup.classList.add("hidden");
}

export function showLoading(message = "Loading...") {
    const overlay = document.getElementById("loading-overlay");
    const msgEl = document.getElementById("loading-message");
    if (msgEl) msgEl.textContent = message;
    if (overlay) overlay.style.display = "flex";
}

export function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    if (overlay) overlay.style.display = "none";
}
