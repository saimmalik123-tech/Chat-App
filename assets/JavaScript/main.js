document.addEventListener("DOMContentLoaded", () => {
    // ---------- THEME TOGGLE ----------
    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
        toggleBtn.textContent = localStorage.getItem("theme") === "dark" ? "☼" : "☽";
        if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");

        toggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark");
            if (document.body.classList.contains("dark")) {
                toggleBtn.textContent = "☼";
                localStorage.setItem("theme", "dark");
            } else {
                toggleBtn.textContent = "☽";
                localStorage.setItem("theme", "light");
            }
        });
    }

    // ---------- FRIEND MODAL ----------
    const addFriendsBtn = document.querySelector('.addFriends');
    const friendModal = document.querySelector('#friendModal');
    const closeBtn = document.querySelector('.close');

    if (addFriendsBtn && friendModal && closeBtn) {
        addFriendsBtn.addEventListener('click', () => {
            friendModal.classList.remove('hidden');
        });
        closeBtn.addEventListener('click', () => {
            friendModal.classList.add('hidden');
        });
        window.addEventListener('click', (e) => {
            if (e.target === friendModal) friendModal.classList.add('hidden');
        });
    }

    // ---------- CHAT SWITCHING ----------
    const chatContainer = document.querySelector('.chat-area');
    const contactCon = document.querySelector('.sidebar');

    function smallScreen() {
        if (!contactCon || !chatContainer) return;
        if (window.innerWidth <= 768) {
            contactCon.style.display = 'flex';
            chatContainer.style.display = 'none';
            chatContainer.classList.add('width');

            const input = document.querySelector(".chat-input input");
            const messages = document.querySelector(".messages");

            if (input && messages) {
                input.addEventListener("focus", () => {
                    setTimeout(() => {
                        messages.scrollTop = messages.scrollHeight;
                    }, 300);
                });
            }

        } else {
            contactCon.style.display = 'flex';
            chatContainer.style.display = 'flex';
            chatContainer.classList.remove('width');
        }
    }
    window.addEventListener('resize', smallScreen);
    smallScreen();

    // Modal PopUp
    /* Popup function */
    function showPopup(message) {
        const popup = document.getElementById("popup");
        const messageEl = document.getElementById("popup-message");
        const closeBtn = document.getElementById("popup-close");

        if (!popup || !messageEl) return;

        messageEl.textContent = message;
        popup.classList.remove("hidden");

        closeBtn.onclick = () => {
            popup.classList.add("hidden");
        };
    }



    function showLoading(message = "Loading...") {
        const overlay = document.getElementById("loading-overlay");
        const msgEl = document.getElementById("loading-message");
        if (msgEl) msgEl.textContent = message;
        if (overlay) overlay.style.display = "flex";
    }

    function hideLoading() {
        const overlay = document.getElementById("loading-overlay");
        if (overlay) overlay.style.display = "none";
    }

});
