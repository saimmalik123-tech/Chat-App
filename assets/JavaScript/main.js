import { showPopup, showLoading, hideLoading } from "./popup.js";

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

    /* ------------------ Profile Popup ------------------ */
    const profilePic = document.querySelector(".profile-pic"); // your avatar
    const profilePopup = document.getElementById("profile-popup");
    const closeProfile = document.getElementById("close-profile");
    const profilePreview = document.getElementById("profile-preview");
    const profileUpload = document.getElementById("profile-upload");
    const bioInput = document.getElementById("bio");
    const saveProfileBtn = document.getElementById("save-profile");
    const logoutBtn = document.getElementById("logout");

    // Open popup
    profilePic?.addEventListener("click", async () => {
        profilePopup.classList.remove("hidden");

        // Load current profile
        const { data: profile } = await client
            .from("user_profiles")
            .select("profile_image_url, bio")
            .eq("user_id", currentUserId)
            .maybeSingle();

        if (profile?.profile_image_url) profilePreview.src = profile.profile_image_url;
        if (profile?.bio) bioInput.value = profile.bio;
    });

    // Close popup
    closeProfile?.addEventListener("click", () => {
        profilePopup.classList.add("hidden");
    });

    // Preview new image
    profileUpload?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => { profilePreview.src = ev.target.result; };
            reader.readAsDataURL(file);
        }
    });

    // Save profile
    saveProfileBtn?.addEventListener("click", async () => {
        try {
            let imageUrl = profilePreview.src;
            const bio = bioInput.value.trim();

            const { error } = await client
                .from("user_profiles")
                .update({ profile_image_url: imageUrl, bio })
                .eq("user_id", currentUserId);

            if (error) throw error;

            showPopup("Profile updated successfully!", "success");
            profilePopup.classList.add("hidden");

            // refresh avatar
            fetchCurrentUserAvatar();
        } catch (err) {
            console.error("Error updating profile:", err.message);
            showPopup("Failed to update profile.", "error");
        }
    });

    // Logout
    logoutBtn?.addEventListener("click", async () => {
        await client.auth.signOut();
        showPopup("Logged out!", "info");
        window.location.href = "signup.html";
    });

});
