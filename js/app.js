import { removeBackground } from "./background-api.js";
import { deleteImage, downloadImage, getImages, uploadImage } from "./images.js";
import { onAuthStateChange, sendPasswordReset, signIn, signOut, signUp, updatePassword } from "./supabase.js";
import { isSupportedImage, processImage } from "./processing.js";
import { supabaseConfigured } from "./config.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const state = {
  session: null,
  authReady: false,
  authError: "",
  passwordRecovery: false,
  authMode: "signin",
  files: [],
  images: [],
  addWatermark: false,
  removeBackground: false,
  watermarkText: "",
  watermarkPosition: "bottom-right",
  watermarkOpacity: 0.5,
  watermarkScale: 1,
  isProcessing: false,
  imageUrls: [],
};

const icons = {
  upload: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>',
  gallery: '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>',
  cloud: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 16.2A4.5 4.5 0 0 0 18 7.5a6 6 0 0 0-11.5 1.3A3.8 3.8 0 0 0 7 16.3"/><path d="M12 12v9m-4-4 4-4 4 4"/></svg>',
  image: '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
  lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", releaseImageUrls);
void initialize();

async function initialize() {
  if (!location.hash) {
    location.hash = "#/login";
  }

  if (supabaseConfigured) {
    state.passwordRecovery = /(?:^#|&)type=recovery(?:&|$)/.test(location.hash);
    try {
      const { getSession } = await import("./supabase.js");
      state.session = await getSession();
      await onAuthStateChange((session, event) => {
        state.session = session;
        state.passwordRecovery = event === "PASSWORD_RECOVERY";
        queueMicrotask(render);
      });
    } catch (error) {
      console.error("Could not initialize Supabase authentication.", error);
      state.authError = error instanceof Error ? error.message : "Could not connect to Supabase.";
    }
  }

  state.authReady = true;
  render();
}

function currentRoute() {
  const route = location.hash.replace(/^#/, "");
  return route || "/login";
}

function render() {
  if (!state.authReady) {
    app.innerHTML = '<main class="loading-screen" aria-label="Connecting to your account"><span class="brand-mark" aria-hidden="true">C</span><span>Connecting securely…</span></main>';
    return;
  }

  if (state.passwordRecovery && state.session) {
    renderPasswordRecovery();
    return;
  }

  const route = currentRoute();
  if (state.session && route === "/login") {
    location.hash = "#/dashboard";
    return;
  }
  if (!state.session) {
    if (route !== "/login") {
      location.hash = "#/login";
    }
    renderLogin();
    return;
  }

  if (route === "/gallery") {
    renderShell("gallery", renderGallery());
    void loadGallery();
    return;
  }

  renderShell("dashboard", renderDashboard());
  bindDashboard();
}

function renderLogin() {
  const configured = supabaseConfigured && !state.authError;
  const mode = state.authMode;
  const isSignUp = mode === "signup";

  app.innerHTML = `
    <main class="login-screen">
      <section class="login-visual" aria-label="About Cutout">
        <a class="login-brand" href="#/login" aria-label="Cutout home">
          <span class="brand-mark" aria-hidden="true">C</span>
          <span class="brand-name">cutout</span>
        </a>
        <div class="login-visual-copy">
          <h2>Good images start with a little care.</h2>
          <p>Prepare your images, add a finishing touch, and keep everything together in one simple workspace.</p>
        </div>
        <p class="login-visual-footer">A quiet little space for your creative work.</p>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <div class="login-copy">
            <p class="eyebrow">Welcome to Cutout</p>
            <h1>${isSignUp ? "Create your account." : "Make yourself at home."}</h1>
            <p class="page-description">Sign in to your private image workspace.</p>
          </div>
          ${!configured ? `
            <div class="demo-banner" role="alert">
              <span aria-hidden="true">ⓘ</span>
              <span><strong>Supabase setup needed.</strong> ${escapeHtml(state.authError || "Add your project URL and public anon key to js/config.js, then run the SQL migration.")}</span>
            </div>
          ` : ""}
          ${configured ? `
            <div class="auth-tabs" role="tablist" aria-label="Account">
              <button class="auth-tab ${!isSignUp ? "is-active" : ""}" id="signin-tab" type="button" role="tab" aria-selected="${!isSignUp}" data-auth-mode="signin">Sign in</button>
              <button class="auth-tab ${isSignUp ? "is-active" : ""}" id="signup-tab" type="button" role="tab" aria-selected="${isSignUp}" data-auth-mode="signup">Create account</button>
            </div>
            <form class="login-form" id="login-form">
              <div>
                <label class="field-label" for="login-email">Email address</label>
                <input class="text-input" id="login-email" type="email" autocomplete="email" placeholder="you@example.com" required>
              </div>
              <div>
                <label class="field-label" for="login-password">Password</label>
                <input class="text-input" id="login-password" type="password" autocomplete="${isSignUp ? "new-password" : "current-password"}" minlength="${isSignUp ? "8" : "1"}" placeholder="${isSignUp ? "At least 8 characters" : "Your password"}" required>
              </div>
              <button class="primary-button" id="auth-submit" type="submit">${isSignUp ? "Create account" : "Sign in"} <span aria-hidden="true">→</span></button>
            </form>
            ${!isSignUp ? '<button class="text-button" id="forgot-password" type="button">Forgot your password?</button>' : ""}
            <p class="login-footnote">Your images are private to your account.</p>
          ` : ""}
        </div>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.authError = "";
      renderLogin();
    });
  });

  const form = document.querySelector("#login-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAuthForm();
  });
  document.querySelector("#forgot-password")?.addEventListener("click", () => {
    void resetPassword();
  });
}

async function submitAuthForm() {
  const email = document.querySelector("#login-email").value.trim();
  const password = document.querySelector("#login-password").value;
  const submit = document.querySelector("#auth-submit");
  submit.disabled = true;
  submit.textContent = state.authMode === "signup" ? "Creating account…" : "Signing in…";

  try {
    const session = state.authMode === "signup"
      ? await signUp(email, password)
      : await signIn(email, password);

    if (!session && state.authMode === "signup") {
      state.authMode = "signin";
      renderLogin();
      showToast("Account created. Check your email to confirm it, then sign in.", "success");
      return;
    }

    state.session = session;
    state.authError = "";
    location.hash = "#/dashboard";
    render();
  } catch (error) {
    console.error("Authentication request failed.", error);
    showToast(authErrorMessage(error), "error");
    submit.disabled = false;
    submit.innerHTML = `${state.authMode === "signup" ? "Create account" : "Sign in"} <span aria-hidden="true">→</span>`;
  }
}

async function resetPassword() {
  const email = document.querySelector("#login-email").value.trim();
  if (!email) {
    document.querySelector("#login-email").focus();
    showToast("Enter your email address first.", "error");
    return;
  }

  try {
    await sendPasswordReset(email, `${location.origin}${location.pathname}`);
    showToast("If an account exists for that email, a password reset link has been sent.", "success");
  } catch (error) {
    console.error("Could not send the password reset email.", error);
    showToast(authErrorMessage(error), "error");
  }
}

function renderPasswordRecovery() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-visual" aria-label="About Cutout">
        <a class="login-brand" href="#/dashboard"><span class="brand-mark" aria-hidden="true">C</span><span class="brand-name">cutout</span></a>
        <div class="login-visual-copy"><h2>A fresh start.</h2><p>Choose a new password for your Cutout account.</p></div>
        <p class="login-visual-footer">Your image workspace, ready when you are.</p>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <div class="login-copy"><p class="eyebrow">Account recovery</p><h1>Set a new password.</h1></div>
          <form class="login-form" id="recovery-form">
            <div><label class="field-label" for="new-password">New password</label><input class="text-input" id="new-password" type="password" minlength="8" autocomplete="new-password" required></div>
            <button class="primary-button" type="submit">Update password</button>
          </form>
        </div>
      </section>
    </main>
  `;

  document.querySelector("#recovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#new-password").value;
    try {
      await updatePassword(password);
      state.passwordRecovery = false;
      showToast("Your password has been updated.", "success");
      location.hash = "#/dashboard";
      render();
    } catch (error) {
      console.error("Could not update the account password.", error);
      showToast(authErrorMessage(error), "error");
    }
  });
}

function renderShell(activePage, content) {
  const email = state.session?.user?.email || "Account";
  const displayName = email.split("@")[0] || "Account";
  const initials = displayName.slice(0, 2).toUpperCase();
  const title = activePage === "gallery" ? "Gallery" : "Upload images";

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#/dashboard" aria-label="Cutout dashboard">
          <span class="brand-mark" aria-hidden="true">C</span><span class="brand-name">cutout</span>
        </a>
        <p class="workspace-label">Workspace</p>
        <nav class="nav-list" aria-label="Main navigation">
          <a class="nav-link" href="#/dashboard" ${activePage === "dashboard" ? 'aria-current="page"' : ""}>${icons.upload}<span class="nav-text">Upload images</span></a>
          <a class="nav-link" href="#/gallery" ${activePage === "gallery" ? 'aria-current="page"' : ""}>${icons.gallery}<span class="nav-text">My gallery</span></a>
        </nav>
        <div class="sidebar-bottom">
          <div class="local-note"><p class="local-note-title"><span class="status-dot" aria-hidden="true"></span> Private workspace</p><p class="local-note-copy">Your account policies protect your image files.</p></div>
          <div class="user-card">
            <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <div class="user-meta"><p class="user-name">${escapeHtml(displayName)}</p><p class="user-plan">${escapeHtml(email)}</p></div>
            <button class="icon-button" id="logout-button" type="button" aria-label="Sign out" title="Sign out">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </aside>
      <main class="main-panel">
        <header class="topbar"><div class="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>${title}</strong></div><div class="topbar-status"><span class="status-dot" aria-hidden="true"></span> Signed in</div></header>
        ${content}
      </main>
    </div>
  `;
  document.querySelector("#logout-button").addEventListener("click", () => void logout());
}

function renderDashboard() {
  return `
    <section class="page-content">
      <div class="page-heading"><div><p class="eyebrow">Your creative workspace</p><h1>Make every image yours.</h1><p class="page-description">Add images, make a few adjustments, and keep your finished work close.</p></div></div>
      <div class="upload-layout">
        <div class="column-stack">
          <section class="card" aria-labelledby="images-title">
            <div class="card-header"><div class="card-title-row"><div><h2 class="card-title" id="images-title">Add your images</h2><p class="card-subtitle">Choose one or more images to get started.</p></div><span class="step-pill" aria-hidden="true">01</span></div></div>
            <label class="dropzone" id="dropzone" for="image-input">
              <input id="image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple>
              <span class="dropzone-icon">${icons.cloud}</span><span class="dropzone-title">Drop images here, or <span>browse files</span></span><span class="dropzone-hint">PNG, JPG or WebP · up to 20 MB each</span>
            </label>
            <div class="file-list" id="file-list" aria-live="polite"></div>
          </section>
          <div class="process-actions"><p class="privacy-copy">${icons.lock} Private to your account</p><button class="primary-button" id="process-button" type="button" disabled><span aria-hidden="true">✦</span> Prepare images</button></div>
        </div>
        <div class="column-stack">
          <section class="card" aria-labelledby="options-title">
            <div class="card-header"><div class="card-title-row"><div><h2 class="card-title" id="options-title">Finishing touches</h2><p class="card-subtitle">Choose what your images need.</p></div><span class="step-pill" aria-hidden="true">02</span></div></div>
            <div class="option-list">
              <div class="option-row"><div class="option-copy"><span class="option-label">Remove background</span><p class="option-description">Create a clean, transparent background.</p></div><button class="switch" id="background-switch" type="button" role="switch" aria-checked="${state.removeBackground}" aria-label="Remove background"></button></div>
              <div class="unavailable-note"><span aria-hidden="true">ⓘ</span><span>Background removal runs on the Python service and may download its model the first time it is used.</span></div>
              <div class="option-row"><div class="option-copy"><span class="option-label">Add a watermark</span><p class="option-description">Mark your work with a little something of your own.</p></div><button class="switch" id="watermark-switch" type="button" role="switch" aria-checked="${state.addWatermark}" aria-label="Add a watermark"></button></div>
              ${state.addWatermark ? renderWatermarkSettings() : ""}
            </div>
          </section>
          <div class="card info-card"><p class="card-title">Your images, your account</p><p class="card-subtitle">Images are stored in private cloud storage. Access is limited by your signed-in account.</p></div>
        </div>
      </div>
    </section>
  `;
}

function renderWatermarkSettings() {
  return `
    <div class="watermark-settings">
      <div><label class="field-label" for="watermark-text">Watermark text</label><input class="text-input" id="watermark-text" type="text" maxlength="80" placeholder="Your name or brand" value="${escapeHtml(state.watermarkText)}"></div>
      <div><label class="field-label" for="watermark-position">Position</label><select class="select-input" id="watermark-position">
        ${[["top-left", "Top left"], ["top-right", "Top right"], ["center", "Center"], ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]]
          .map(([value, label]) => `<option value="${value}" ${state.watermarkPosition === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></div>
      <div><div class="range-heading"><label class="field-label" for="watermark-opacity">Opacity</label><output class="range-value" id="opacity-value">${Math.round(state.watermarkOpacity * 100)}%</output></div><input class="range-input" id="watermark-opacity" type="range" min="0.1" max="1" step="0.1" value="${state.watermarkOpacity}"></div>
      <div><div class="range-heading"><label class="field-label" for="watermark-scale">Size</label><output class="range-value" id="scale-value">${state.watermarkScale.toFixed(1)}×</output></div><input class="range-input" id="watermark-scale" type="range" min="0.5" max="3" step="0.1" value="${state.watermarkScale}"></div>
    </div>
  `;
}

function bindDashboard() {
  const input = document.querySelector("#image-input");
  const dropzone = document.querySelector("#dropzone");
  input.addEventListener("change", () => {
    addFiles([...input.files]);
    input.value = "";
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
  });
  dropzone.addEventListener("dragleave", (event) => {
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-dragging");
  });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragging");
    addFiles([...event.dataTransfer.files]);
  });
  document.querySelector("#watermark-switch").addEventListener("click", () => {
    state.addWatermark = !state.addWatermark;
    render();
  });
  document.querySelector("#background-switch").addEventListener("click", () => {
    state.removeBackground = !state.removeBackground;
    render();
  });
  bindWatermarkInputs();
  renderFileList();
}

function bindWatermarkInputs() {
  const textInput = document.querySelector("#watermark-text");
  if (!textInput) return;

  textInput.addEventListener("input", () => { state.watermarkText = textInput.value; });
  document.querySelector("#watermark-position").addEventListener("change", (event) => { state.watermarkPosition = event.target.value; });
  document.querySelector("#watermark-opacity").addEventListener("input", (event) => {
    state.watermarkOpacity = Number(event.target.value);
    document.querySelector("#opacity-value").value = `${Math.round(state.watermarkOpacity * 100)}%`;
  });
  document.querySelector("#watermark-scale").addEventListener("input", (event) => {
    state.watermarkScale = Number(event.target.value);
    document.querySelector("#scale-value").value = `${state.watermarkScale.toFixed(1)}×`;
  });
}

function addFiles(files) {
  const accepted = [];
  const issues = [];
  for (const file of files) {
    if (!isSupportedImage(file)) {
      issues.push(`${file.name}: use a PNG, JPG, or WebP image.`);
    } else if (file.size > MAX_FILE_SIZE) {
      issues.push(`${file.name}: the file is larger than 20 MB.`);
    } else {
      accepted.push({ id: createId(), file, previewUrl: URL.createObjectURL(file) });
    }
  }

  state.files.push(...accepted);
  renderFileList();
  if (issues.length) showToast(issues.slice(0, 2).join(" "), "error");
  else if (accepted.length) showToast(`${accepted.length} image${accepted.length === 1 ? "" : "s"} ready to prepare.`, "success");
}

function renderFileList() {
  const list = document.querySelector("#file-list");
  if (!list) return;

  list.innerHTML = state.files.map((entry) => `
    <div class="file-row">
      <img class="file-thumb" src="${entry.previewUrl}" alt="">
      <div class="file-details"><p class="file-name" title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</p><p class="file-size">${formatBytes(entry.file.size)}</p></div>
      <button class="small-icon-button" type="button" data-remove-file="${entry.id}" aria-label="Remove ${escapeHtml(entry.file.name)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg></button>
    </div>
  `).join("");

  const processButton = document.querySelector("#process-button");
  processButton.disabled = state.isProcessing || state.files.length === 0;
  processButton.innerHTML = state.isProcessing
    ? '<span class="spinner" aria-hidden="true"></span> Preparing…'
    : '<span aria-hidden="true">✦</span> Prepare images';
  processButton.onclick = () => void processSelectedFiles();

  list.querySelectorAll("[data-remove-file]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = state.files.find((file) => file.id === button.dataset.removeFile);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      state.files = state.files.filter((file) => file.id !== button.dataset.removeFile);
      renderFileList();
    });
  });
}

async function processSelectedFiles() {
  if (!state.files.length || state.isProcessing) return;
  if (state.addWatermark && !state.watermarkText.trim()) {
    showToast("Add some watermark text or turn off the watermark.", "error");
    document.querySelector("#watermark-text")?.focus();
    return;
  }

  state.isProcessing = true;
  renderFileList();
  let completed = 0;
  let firstError = "";
  const processingUserId = state.session.user.id;
  const options = {
    addWatermark: state.addWatermark,
    watermarkText: state.watermarkText,
    watermarkPosition: state.watermarkPosition,
    watermarkOpacity: state.watermarkOpacity,
    watermarkScale: state.watermarkScale,
  };

  for (const entry of [...state.files]) {
    try {
      let source = entry.file;
      if (state.removeBackground) {
        const transparentBlob = await removeBackground(entry.file, entry.file.name);
        source = new File([transparentBlob], entry.file.name, { type: "image/png" });
      }
      const processed = await processImage(source, options);
      if (processed.blob.size > MAX_FILE_SIZE) {
        throw new Error("The prepared image exceeds the 20 MB storage limit. Try a smaller original image.");
      }
      if (state.session?.user?.id !== processingUserId) {
        throw new Error("Your account changed while processing. Sign in again and retry this image.");
      }
      await uploadImage(processed, processingUserId);
      URL.revokeObjectURL(entry.previewUrl);
      state.files = state.files.filter((file) => file.id !== entry.id);
      completed += 1;
    } catch (error) {
      console.error(`Could not process ${entry.file.name}.`, error);
      firstError ||= error instanceof Error ? error.message : "Image processing failed.";
    }
  }

  state.isProcessing = false;
  if (completed) {
    showToast(`${completed} image${completed === 1 ? "" : "s"} saved to your gallery.`, "success");
    location.hash = "#/gallery";
  }
  if (firstError) {
    showToast(completed ? `${completed} saved. One or more images failed: ${firstError}` : firstError, "error");
    render();
  } else if (!completed) {
    render();
  }
}

function renderGallery() {
  return `
    <section class="page-content">
      <div class="page-heading"><div><p class="eyebrow">Your saved work</p><h1>My gallery.</h1><p class="page-description">Images prepared in your private workspace.</p></div><div class="gallery-toolbar"><span class="count-pill" id="image-count">Loading…</span><a class="primary-button" href="#/dashboard"><span aria-hidden="true">+</span> Add images</a></div></div>
      <div id="gallery-content" aria-live="polite"><div class="empty-state"><span class="empty-icon">${icons.image}</span><h2>Loading your gallery</h2><p>Your images will appear here.</p></div></div>
    </section>
  `;
}

async function loadGallery() {
  const container = document.querySelector("#gallery-content");
  const count = document.querySelector("#image-count");
  if (!container || !count) return;

  releaseImageUrls();
  try {
    state.images = await getImages();
    if (!document.querySelector("#gallery-content")) return;

    count.textContent = `${state.images.length} image${state.images.length === 1 ? "" : "s"}`;
    if (!state.images.length) {
      container.innerHTML = `<div class="empty-state"><span class="empty-icon">${icons.image}</span><h2>Your gallery is ready for its first image.</h2><p>Upload images to see them here. They’ll be available when you sign in on another device.</p><a class="primary-button" href="#/dashboard"><span aria-hidden="true">+</span> Upload images</a></div>`;
      return;
    }

    container.innerHTML = `<div class="gallery-grid">${state.images.map((image) => `
      <article class="image-card">
        <div class="image-card-preview"><img src="${escapeHtml(image.preview_url)}" alt="${escapeHtml(image.original_name)}"><div class="download-overlay"><button class="secondary-button" type="button" data-download-image="${image.id}">Download</button></div></div>
        <div class="image-card-details"><div style="min-width:0"><p class="image-card-name" title="${escapeHtml(image.original_name)}">${escapeHtml(image.original_name)}</p><p class="image-card-date">${new Date(image.created_at).toLocaleDateString()}</p></div><button class="icon-button" type="button" data-delete-image="${image.id}" aria-label="Delete ${escapeHtml(image.original_name)}" title="Delete image"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></svg></button></div>
      </article>
    `).join("")}</div>`;

    container.querySelectorAll("[data-download-image]").forEach((button) => {
      button.addEventListener("click", () => void downloadGalleryImage(button.dataset.downloadImage));
    });
    container.querySelectorAll("[data-delete-image]").forEach((button) => {
      button.addEventListener("click", () => void removeGalleryImage(button.dataset.deleteImage));
    });
  } catch (error) {
    console.error("Could not load the signed-in user's gallery.", error);
    count.textContent = "Unavailable";
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">${icons.image}</span><h2>Could not open your gallery.</h2><p>${escapeHtml(error instanceof Error ? error.message : "Check your Supabase configuration and storage policies.")}</p><button class="secondary-button" type="button" id="retry-gallery">Try again</button></div>`;
    document.querySelector("#retry-gallery")?.addEventListener("click", () => void loadGallery());
  }
}

async function downloadGalleryImage(id) {
  const image = state.images.find((item) => item.id === id);
  if (!image) {
    showToast("That image is no longer in your gallery.", "error");
    return;
  }

  try {
    const blob = await downloadImage(image);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = makePngFilename(image.original_name);
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Could not download this gallery image.", error);
    showToast(error instanceof Error ? error.message : "Could not download the image.", "error");
  }
}

async function removeGalleryImage(id) {
  const image = state.images.find((item) => item.id === id);
  if (!image) {
    showToast("That image is no longer in your gallery.", "error");
    return;
  }
  try {
    await deleteImage(image);
    showToast("Image removed from your gallery.", "success");
    await loadGallery();
  } catch (error) {
    console.error("Could not remove this gallery image.", error);
    showToast(error instanceof Error ? error.message : "Could not delete the image.", "error");
  }
}

async function logout() {
  try {
    await signOut();
    state.session = null;
    state.passwordRecovery = false;
    state.files.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
    state.files = [];
    location.hash = "#/login";
    render();
  } catch (error) {
    console.error("Could not sign out of Supabase.", error);
    showToast(authErrorMessage(error), "error");
  }
}

function releaseImageUrls() {
  for (const url of state.imageUrls) URL.revokeObjectURL(url);
  state.imageUrls = [];
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.kind = kind;
  const title = document.createElement("p");
  title.className = "toast-title";
  title.textContent = kind === "error" ? "Something needs attention" : "All set";
  const body = document.createElement("p");
  body.className = "toast-message";
  body.textContent = message;
  toast.append(title, body);
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 5000);
}

function authErrorMessage(error) {
  return error instanceof Error ? error.message : "Authentication failed. Please try again.";
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function makePngFilename(filename) {
  return `${filename.replace(/\.[^.]+$/, "")}-cutout.png`;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
