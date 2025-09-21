import { client } from "../../supabase.js";

const loaderContainer = document.querySelector('.loader-container');
const popupElement = document.getElementById('popup');
const popupMessageElement = document.getElementById('popup-message');
const popupCloseButton = document.querySelector('.popup-close');

function showLoader() {
    if (loaderContainer) {
        loaderContainer.style.display = 'flex';
    }
}

function hideLoader() {
    if (loaderContainer) {
        loaderContainer.style.display = 'none';
    }
}

function showPopup(message) {
    if (popupMessageElement && popupElement) {
        popupMessageElement.textContent = message;
        popupElement.classList.remove('hidden');
    }
}

function hidePopup() {
    if (popupElement) {
        popupElement.classList.add('hidden');
    }
}

if (popupCloseButton) {
    popupCloseButton.addEventListener('click', hidePopup);
}

async function handleGoogleAuth() {
    showLoader();

    try {
        const { data: { user }, error } = await client.auth.getUser();

        if (error || !user) {
            showPopup("Google login failed.");
            window.location.href = "login.html";
            return;
        }

        const email = user.email;
        const name = user.user_metadata?.full_name || "Unknown";

        const { data: existingUser, error: checkError } = await client
            .from("private_users")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if (checkError) {
            showPopup("Error checking user: " + checkError.message);
            return;
        }

        if (existingUser) {
            window.location.href = "dashboard.html";
            return;
        }

        const { error: insertError } = await client
            .from("private_users")
            .insert([{ name, email }]);

        if (insertError) {
            showPopup("Error saving to table: " + insertError.message);
            return;
        }

        window.location.href = "setupProfile.html";

    } catch (err) {
        showPopup("An unexpected error occurred: " + err.message);
    } finally {
        hideLoader();
    }
}

handleGoogleAuth();