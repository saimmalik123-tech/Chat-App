function showNotification(title, body, icon = "./assets/icon/user.png", onClickUrl = "dashboard") {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const notification = new Notification(title, { body, icon });
    notification.onclick = () => {
        window.focus();
        window.location.href = onClickUrl;
    };
}


document.addEventListener("DOMContentLoaded", () => {
    // ---------- THEME TOGGLE ----------
    const toggleBtn = document.getElementById("themeToggle");
    if (toggleBtn) {
        toggleBtn.textContent = localStorage.getItem("theme") === "dark" ? "𖤓" : "⏾";
        if (localStorage.getItem("theme") === "dark") document.body.classList.add("dark");

        toggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark");
            if (document.body.classList.contains("dark")) {
                toggleBtn.textContent = "𖤓";
                localStorage.setItem("theme", "dark");
            } else {
                toggleBtn.textContent = "⏾";
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
        } else {
            contactCon.style.display = 'flex';
            chatContainer.style.display = 'flex';
        }
    }
    window.addEventListener('resize', smallScreen);
    smallScreen();


    const settingsModal = document.getElementById('user-settings-modal');
    const nameEditorModal = document.getElementById('name-editor-modal');
    const closeSettingsBtn = document.getElementById('close-settings');
    const closeNameEditorBtn = document.getElementById('close-name-editor');
    const editNameBtn = document.getElementById('edit-name-btn');
    const cancelNameChangeBtn = document.getElementById('cancel-name-change');
    const saveSettingsBtn = document.getElementById('save-settings');
    const confirmNameChangeBtn = document.getElementById('confirm-name-change');
    const logoutBtn = document.getElementById('logout-user');

    const userAvatar = document.getElementById('user-avatar');
    const avatarUpload = document.getElementById('avatar-upload');
    const displayName = document.getElementById('display-name');
    const userBio = document.getElementById('user-bio');
    const clearBioBtn = document.getElementById('clear-bio');
    const bioCharCount = document.getElementById('bio-char-count');
    const newDisplayName = document.getElementById('new-display-name');
    const nameCharCount = document.getElementById('name-char-count');

    const maxBioLength = 150;
    const maxNameLength = 20;

    const createLoader = () => {
        const loader = document.createElement('div');
        loader.className = 'btn-loader';
        loader.innerHTML = `
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
            </svg>
            <span>Saving...</span>
        `;
        return loader;
    };

    if (userBio && bioCharCount) {
        userBio.addEventListener('input', () => {
            const currentLength = userBio.value.length;
            bioCharCount.textContent = currentLength;

            if (currentLength > maxBioLength * 0.9) {
                bioCharCount.style.color = 'var(--accent)';
            } else {
                bioCharCount.style.color = 'var(--text-secondary)';
            }

            userBio.style.height = 'auto';
            userBio.style.height = Math.min(userBio.scrollHeight, 200) + 'px';
        });

        bioCharCount.textContent = userBio.value.length;

        if (clearBioBtn) {
            clearBioBtn.addEventListener('click', () => {
                userBio.value = '';
                bioCharCount.textContent = '0';
                userBio.style.height = 'auto';
                userBio.focus();
            });
        }

        userBio.addEventListener('keydown', (e) => {
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
            ];

            if (!allowedKeys.includes(e.key) &&
                userBio.value.length >= maxBioLength &&
                !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
            }
        });

        userBio.addEventListener('paste', (e) => {
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            if (userBio.value.length + paste.length > maxBioLength) {
                e.preventDefault();
            }
        });
    }

    if (newDisplayName && nameCharCount) {
        newDisplayName.addEventListener('input', () => {
            const currentLength = newDisplayName.value.length;
            nameCharCount.textContent = currentLength;

            if (currentLength > maxNameLength * 0.9) {
                nameCharCount.style.color = 'var(--accent)';
            } else {
                nameCharCount.style.color = 'var(--text-secondary)';
            }
        });

        nameCharCount.textContent = newDisplayName.value.length;

        newDisplayName.addEventListener('keydown', (e) => {
            const allowedKeys = [
                'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
            ];

            if (!allowedKeys.includes(e.key) &&
                newDisplayName.value.length >= maxNameLength &&
                !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
            }
        });

        newDisplayName.addEventListener('paste', (e) => {
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            if (newDisplayName.value.length + paste.length > maxNameLength) {
                e.preventDefault();
            }
        });
    }

    if (avatarUpload && userAvatar) {
        avatarUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    userAvatar.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (editNameBtn && nameEditorModal) {
        editNameBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
            nameEditorModal.classList.remove('hidden');
            newDisplayName.value = displayName.textContent;
            nameCharCount.textContent = newDisplayName.value.length;
            newDisplayName.focus();
        });
    }

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    if (closeNameEditorBtn && nameEditorModal) {
        closeNameEditorBtn.addEventListener('click', () => {
            nameEditorModal.classList.add('hidden');
            settingsModal.classList.remove('hidden');
        });
    }

    if (cancelNameChangeBtn && nameEditorModal) {
        cancelNameChangeBtn.addEventListener('click', () => {
            nameEditorModal.classList.add('hidden');
            settingsModal.classList.remove('hidden');
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            const originalContent = saveSettingsBtn.innerHTML;

            saveSettingsBtn.disabled = true;
            saveSettingsBtn.querySelector('.btn-text').style.opacity = '0';
            saveSettingsBtn.querySelector('.btn-loader').classList.remove('hidden');

            const bioContent = userBio ? userBio.value.trim() : '';

            try {
                await new Promise(resolve => setTimeout(resolve, 1500));

                console.log('Saving profile settings:', { bio: bioContent });

                saveSettingsBtn.querySelector('.btn-text').textContent = 'Saved!';
                saveSettingsBtn.querySelector('.btn-loader').classList.add('hidden');
                saveSettingsBtn.querySelector('.btn-text').style.opacity = '1';

                setTimeout(() => {
                    saveSettingsBtn.disabled = false;
                    saveSettingsBtn.innerHTML = originalContent;
                }, 1500);

            } catch (error) {
                console.error('Error saving profile:', error);

                saveSettingsBtn.querySelector('.btn-text').textContent = 'Error';
                saveSettingsBtn.querySelector('.btn-loader').classList.add('hidden');
                saveSettingsBtn.querySelector('.btn-text').style.opacity = '1';

                setTimeout(() => {
                    saveSettingsBtn.disabled = false;
                    saveSettingsBtn.innerHTML = originalContent;
                }, 2000);
            }
        });
    }

    if (confirmNameChangeBtn) {
        confirmNameChangeBtn.addEventListener('click', async () => {
            const originalContent = confirmNameChangeBtn.innerHTML;

            confirmNameChangeBtn.disabled = true;
            confirmNameChangeBtn.innerHTML = '';
            confirmNameChangeBtn.appendChild(createLoader());

            const newName = newDisplayName ? newDisplayName.value.trim() : '';

            if (!newName) {
                confirmNameChangeBtn.disabled = false;
                confirmNameChangeBtn.innerHTML = originalContent;
                return;
            }

            try {
                await new Promise(resolve => setTimeout(resolve, 1500));

                console.log('Updating username:', { newName });

                displayName.textContent = newName;

                confirmNameChangeBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                        <path d="M20 6L9 17l-5 5"></path>
                    </svg>
                    Saved!
                `;

                setTimeout(() => {
                    nameEditorModal.classList.add('hidden');
                    settingsModal.classList.remove('hidden');
                    confirmNameChangeBtn.disabled = false;
                    confirmNameChangeBtn.innerHTML = originalContent;
                }, 1500);

            } catch (error) {
                console.error('Error updating username:', error);

                confirmNameChangeBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    Error
                `;

                setTimeout(() => {
                    confirmNameChangeBtn.disabled = false;
                    confirmNameChangeBtn.innerHTML = originalContent;
                }, 2000);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to logout?')) {
                console.log('User logged out');
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (settingsModal && !settingsModal.classList.contains('hidden') &&
            !e.target.closest('.modal-container')) {
            settingsModal.classList.add('hidden');
        }

        if (nameEditorModal && !nameEditorModal.classList.contains('hidden') &&
            !e.target.closest('.modal-container')) {
            nameEditorModal.classList.add('hidden');
            settingsModal.classList.remove('hidden');
        }
    });

    document.querySelectorAll('.modal-container').forEach(modal => {
        modal.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });

});
