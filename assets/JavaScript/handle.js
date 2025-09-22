import { client } from "./supabase";

const loaderContainer = document.querySelector('.loader-container');
const popupElement = document.getElementById('popup');
const popupMessageElement = document.getElementById('popup-message');
const popupCloseButton = document.querySelector('.popup-close');

function showLoader() {
    if (loaderContainer) loaderContainer.style.display = 'flex';
}
function hideLoader() {
    if (loaderContainer) loaderContainer.style.display = 'none';
}
function showPopup(message) {
    if (popupMessageElement && popupElement) {
        popupMessageElement.textContent = message;
        popupElement.classList.remove('hidden');
    }
}
function hidePopup() {
    if (popupElement) popupElement.classList.add('hidden');
}
if (popupCloseButton) {
    popupCloseButton.addEventListener('click', hidePopup);
}

async function handleGoogleAuth() {
    showLoader();

    try {
        const { data: { user }, error } = await client.auth.getUser();

        if (error || !user) {
            showPopup("No active session. Please login.");
            window.location.href = "login.html";
            return;
        }

        const userId = user.id;

        const { data: profile, error: profileError } = await client
            .from("user_profiles")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

        if (profileError) {
            showPopup("Error checking profile: " + profileError.message);
            return;
        }

        // ✅ 3. Redirect logic
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
