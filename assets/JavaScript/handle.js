import { client } from "../../supabase.js";

const loaderContainer = document.querySelector('.loader-container');
const popupElement = document.getElementById('popup');
const popupMessageElement = document.getElementById('popup-message');
const popupCloseButton = document.querySelector('.popup-close');

function showLoader() {
    loaderContainer && (loaderContainer.style.display = 'flex');
}
function hideLoader() {
    loaderContainer && (loaderContainer.style.display = 'none');
}
function showPopup(message) {
    if (popupMessageElement && popupElement) {
        popupMessageElement.textContent = message;
        popupElement.classList.remove('hidden');
    }
}
function hidePopup() {
    popupElement && popupElement.classList.add('hidden');
}
popupCloseButton?.addEventListener('click', hidePopup);

async function handleGoogleAuth() {
    showLoader();

    try {
        const { data: { user }, error } = await client.auth.getUser();

        if (error || !user) {
            showPopup("No active session. Redirecting to login...");
            setTimeout(() => (window.location.href = "login.html"), 1500);
            return;
        }

        const { data: profile, error: profileError } = await client
            .from("user_profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
            showPopup("Error checking profile: " + profileError.message);
            return;
        }

        if (profile) {
            window.location.href = "dashboard.html";
        } else {
            window.location.href = "setupProfile.html";
        }

    } catch (err) {
        showPopup("Unexpected error: " + err.message);
    } finally {
        hideLoader();
    }
}

handleGoogleAuth();
