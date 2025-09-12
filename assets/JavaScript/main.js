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
        if (window.innerWidth <= 700) {
            contactCon.style.display = 'flex';
            chatContainer.style.display = 'none';
            chatContainer.classList.add('width');
        } else {
            contactCon.style.display = 'flex';
            chatContainer.style.display = 'flex';
            chatContainer.classList.remove('width');
        }
    }
    window.addEventListener('resize', smallScreen);
    smallScreen();

    // call once and on resize to set a reliable --vh unit
    function setVhVar() {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }
    setVhVar();
    window.addEventListener('resize', setVhVar);

    // keyboard/visualViewport handling
    const inputs = document.querySelectorAll('.chat-input input, .chat-input textarea');
    const messages = document.querySelector('.messages');
    const chatInput = document.querySelector('.chat-input');
    const floatingBtn = document.getElementById('message');

    function onKeyboardOpen() {
        if (!window.visualViewport) return;
        const kbHeight = Math.max(0, window.innerHeight - window.visualViewport.height);
        document.documentElement.style.setProperty('--keyboard-height', `${kbHeight}px`);
        document.body.classList.add('keyboard-open');

        // ensure messages are scrolled to bottom and input is visible quickly
        if (messages) {
            // immediate scroll (no smooth) so it happens before layout jumps
            messages.scrollTop = messages.scrollHeight;
        }
        if (chatInput) {
            // try to scroll the input into view using visualViewport offset
            setTimeout(() => chatInput.scrollIntoView({ block: 'end', behavior: 'auto' }), 50);
        }
    }

    function onKeyboardClose() {
        document.documentElement.style.setProperty('--keyboard-height', `0px`);
        document.body.classList.remove('keyboard-open');
        // show floating button again if present
        if (floatingBtn) floatingBtn.style.display = '';
    }

    // update on visualViewport resize (faster/more accurate on mobile)
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            // If an input is focused, treat this as keyboard open/resize
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                onKeyboardOpen();
            } else {
                onKeyboardClose();
            }
        });
    }

    // add focus/blur listeners to actual input(s)
    inputs.forEach((input) => {
        input.addEventListener('focus', () => {
            // small delay to let visualViewport update
            setTimeout(onKeyboardOpen, 50);
        });
        input.addEventListener('blur', () => {
            // close after a tiny delay
            setTimeout(onKeyboardClose, 50);
        });

        // also keep messages pinned to bottom while typing
        input.addEventListener('input', () => {
            if (messages) messages.scrollTop = messages.scrollHeight;
        });
    });

    // When new messages arrive, keep scroll pinned
    function scrollMessagesToBottom() {
        if (messages) messages.scrollTop = messages.scrollHeight;
    }



});
